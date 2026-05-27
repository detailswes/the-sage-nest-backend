const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { logAudit } = require('../utils/auditLog');
const {
  sendBookingCancellationNotification,
  sendBookingConfirmationEmail,
  sendNewBookingNotificationEmail,
  sendRescheduleNotificationEmail,
  sendExpertCancelledSessionEmail,
} = require('../utils/email');

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// Stripe error codes that mean the connected account has no usable balance.
// When these occur with reverse_transfer:true, we fall back to funding the
// refund from the platform balance and flag it for admin follow-up.
const ZERO_BALANCE_CODES = new Set([
  'insufficient_funds',
  'transfer_reversal_too_large',
  'account_invalid',       // deauthorised / disconnected account
  'account_closed',
]);

// ─── createRefundWithFallback ─────────────────────────────────────────────────
// Issues a Stripe refund with an idempotency key.
// When reverse_transfer would be needed but fails due to zero/blocked balance,
// automatically retries without the reversal (platform absorbs the cost) and
// writes an admin note so the funds can be recovered manually.
//
// Returns { refund, platformFunded }
async function createRefundWithFallback({ bookingId, chargeId, amountPence, idempotencyKey, shouldReverseTransfer }) {
  const baseParams = {
    charge:                 chargeId,
    refund_application_fee: true,
    ...(amountPence !== undefined ? { amount: amountPence } : {}),
  };

  try {
    const refund = await stripe.refunds.create(
      { ...baseParams, reverse_transfer: shouldReverseTransfer },
      { idempotencyKey },
    );
    return { refund, platformFunded: false };
  } catch (err) {
    // Only fall back when the transfer reversal is the specific failure point.
    // For any other Stripe error (card_error, API outage, etc.) re-throw so
    // the caller can handle it appropriately.
    if (shouldReverseTransfer && ZERO_BALANCE_CODES.has(err.code)) {
      console.warn(`[createRefundWithFallback] booking=${bookingId} reverse_transfer failed (${err.code}) — retrying without reversal (platform-funded)`);
      // Use a distinct idempotency key so Stripe doesn't return the previous error
      const fallbackKey = `${idempotencyKey}-platform`;
      const refund = await stripe.refunds.create(
        { ...baseParams, reverse_transfer: false },
        { idempotencyKey: fallbackKey },
      );
      return { refund, platformFunded: true };
    }
    throw err;
  }
}

// ─── POST /bookings — parent creates a booking + payment intent ───────────────
//
// Body: { expertId, serviceId, scheduledAt (ISO string), format }
// Returns: { bookingId, clientSecret }
//
async function createBooking(req, res) {
  const { expertId, serviceId, scheduledAt, format, lockId } = req.body;

  if (!expertId || !serviceId || !scheduledAt || !format || !lockId) {
    return res.status(400).json({ error: 'expertId, serviceId, scheduledAt, format, and lockId are required' });
  }
 
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduledAt date' });
  }
  if (scheduledDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  if (!['ONLINE', 'IN_PERSON'].includes(format)) {
    return res.status(400).json({ error: 'format must be ONLINE or IN_PERSON' });
  }

  try {
    // ── Load expert (need stripe_account_id) ────────────────────────────────
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(expertId) },
      include: { user: { select: { name: true } } },
    });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });
    if (expert.status !== 'APPROVED') {
      return res.status(400).json({ error: 'This specialist is not currently accepting bookings.' });
    }
    if (!expert.stripe_account_id) {
      return res.status(400).json({ error: 'Expert has not connected their Stripe account yet' });
    }

    // Verify the connected account has card_payments active — required for
    // on_behalf_of (destination charge with expert as Merchant of Record).
    try {
      const stripeAccount = await stripe.accounts.retrieve(expert.stripe_account_id);
      if (stripeAccount.capabilities?.card_payments !== 'active') {
        return res.status(400).json({
          error: "This expert's payment account is not fully activated yet. They may need to complete their Stripe onboarding. Please try again later or choose another specialist.",
        });
      }
    } catch (e) {
      console.warn('[createBooking] Could not retrieve Stripe account capabilities:', e.message);
      // If Stripe is unreachable, let the PI creation fail naturally with a clear error.
    }

    // ── Load service ────────────────────────────────────────────────────────
    const service = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
    if (!service || service.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (!service.is_active) {
      return res.status(400).json({ error: 'This service is no longer available' });
    }

    // ── Verify T&C accepted for the current version ─────────────────────────
    const currentTcDoc = await prisma.legalDocument.findFirst({
      where: { type: 'TERMS_CONDITIONS' },
      orderBy: { effective_from: 'desc' },
    });
    if (currentTcDoc) {
      const accepted = await prisma.tcAcceptance.findUnique({
        where: { user_id_version: { user_id: req.user.id, version: currentTcDoc.version } },
      });
      if (!accepted) {
        return res.status(400).json({ error: 'You must accept the current Terms & Conditions before proceeding.' });
      }
    }

    // ── Verify slot lock ────────────────────────────────────────────────────
    const now  = new Date();
    const lock = await prisma.slotLock.findUnique({ where: { id: parseInt(lockId) } });
    if (!lock || lock.parent_id !== req.user.id || lock.expert_id !== expert.id) {
      return res.status(400).json({ error: 'Invalid slot reservation. Please select your slot again.' });
    }
    if (lock.expires_at <= now) {
      await prisma.slotLock.delete({ where: { id: lock.id } }).catch(() => {});
      return res.status(400).json({ error: 'Your slot reservation has expired. Please select your slot again.' });
    }
    if (lock.slot_start.getTime() !== scheduledDate.getTime()) {
      return res.status(400).json({ error: 'Slot reservation does not match the selected time.' });
    }

    // ── Create booking + release lock atomically ────────────────────────────
    // Both in one transaction: @@unique([expert_id, scheduled_at]) is the final
    // race-condition guard; the lock is consumed only once the booking is committed.
    const platformFee = (Number(service.price) * 0.20).toFixed(2);
    const currency    = (service.currency || 'EUR').toLowerCase();

    let booking;
    try {
      [booking] = await prisma.$transaction([
        prisma.booking.create({
          data: {
            expert_id:          expert.id,
            parent_id:          req.user.id,
            service_id:         service.id,
            scheduled_at:       scheduledDate,
            duration_minutes:   service.duration_minutes,
            format,
            status:             'PENDING_PAYMENT',
            amount:             service.price,
            currency:           currency.toUpperCase(),
            platform_fee:       platformFee,
            payment_expires_at: new Date(now.getTime() + 30 * 60 * 1000),
          },
        }),
        prisma.slotLock.delete({ where: { id: lock.id } }),
      ]);
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'This time slot is no longer available. Please choose another.' });
      }
      throw err;
    }

    // ── Create Stripe PaymentIntent (Destination Charge) ───────────────────
    // on_behalf_of makes the expert the Merchant of Record — the charge appears
    // on their connected account and their statement descriptor is used.
    // application_fee_amount is Sage Nest's 20% platform fee collected at source.
    // transfer_data.destination routes the net amount to the expert's balance
    // immediately; the expert's account is set to manual payouts so those funds
    // stay in their Stripe balance until our processPayouts job releases them
    // 24 hours after the session ends.
    const amountInPence         = Math.round(Number(service.price) * 100);
    const applicationFeePence   = Math.round(Number(platformFee) * 100);

    console.log(`[Payment] Creating PaymentIntent — booking=${booking.id} expert=${expert.id} amount=${amountInPence}p fee=${applicationFeePence}p`);

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount:                 amountInPence,
        currency,
        on_behalf_of:           expert.stripe_account_id,
        transfer_data:          { destination: expert.stripe_account_id },
        application_fee_amount: applicationFeePence,
        metadata: {
          booking_id: booking.id.toString(),
          expert_id:  expert.id.toString(),
          parent_id:  req.user.id.toString(),
        },
      });
      console.log(`[Payment] PaymentIntent created — id=${paymentIntent.id} status=${paymentIntent.status}`);
    } catch (stripeErr) {
      // Clean up the booking if PaymentIntent creation fails
      await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
      console.error('[Payment] Stripe PaymentIntent creation failed:', stripeErr.message);
      return res.status(500).json({ error: 'Could not initiate payment. Please try again.' });
    }

    // ── Store the payment intent ID on the booking ──────────────────────────
    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripe_payment_intent_id: paymentIntent.id },
    });


    console.log(`[Payment] Booking ${booking.id} ready — clientSecret issued to parent`);

    return res.status(201).json({
      bookingId:    booking.id,
      clientSecret: paymentIntent.client_secret,
      currency:     currency.toUpperCase(),
    });
  } catch (err) {
    console.error('[createBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/:id — get single booking (parent owner or expert owner) ───
async function getBookingById(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { id: true, name: true, email: true } },
        expert:  { include: { user: { select: { id: true, name: true, account_deleted: true } } } },
        service: true,
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Only allow parent who owns it, or expert who owns it
    const isParent = booking.parent_id === req.user.id;
    const isExpert = booking.expert.user_id === req.user.id;
    if (!isParent && !isExpert) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!isExpert) delete booking.expert_note;
    return res.json(booking);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/my — parent's own bookings ─────────────────────────────────
async function getMyBookings(req, res) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { parent_id: req.user.id },
      omit:  { expert_note: true },
      orderBy: { scheduled_at: 'desc' },
      include: {
        expert:  { select: { profile_image: true, address_street: true, address_city: true, address_postcode: true, user: { select: { name: true, account_deleted: true } } } },
        service: { select: { title: true, duration_minutes: true, is_active: true, format: true, price: true, currency: true } },
      },
    });
    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /bookings/:id — parent cancels their booking ─────────────────────
//
// Three-tier cancellation policy — boundary is the request-received timestamp,
// NOT the Stripe processing timestamp:
//
//   ≥ 24 h before session        → full refund  (100%)
//   ≥ 12 h and < 24 h before     → 50% refund
//   < 12 h before session        → no refund    (0%)
//
// Edge-case rules:
//   • Exactly 24 h  → treated as ≥ 24 h  (full refund)
//   • Exactly 12 h  → treated as ≥ 12 h  (50% refund)
//   • No-show       → 0% (< 12 h window; no active cancellation issued by parent)
//   • Expert cancel → always 100% (handled separately via admin controller)
//   • System delay  → cancelledAt is stamped at request arrival, before any
//                     async work, so processing latency never moves a boundary
//
async function cancelBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A cancellation reason is required.' });
  }

  // Stamp the request-received time immediately — this is the authoritative
  // timestamp used for both the tier calculation and the DB audit field.
  // Any subsequent async work (DB fetch, Stripe call) cannot shift the boundary.
  const cancelledAt = new Date();

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { name: true, email: true } },
        expert:  { include: { user: { select: { name: true, email: true } } } },
        service: { select: { title: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(booking.status)) {
      return res.status(400).json({ error: `Booking cannot be cancelled (current status: ${booking.status})` });
    }

    const hoursUntilSession = (booking.scheduled_at.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);
    const wasConfirmed      = booking.status === 'CONFIRMED';

    // Determine refund tier. Boundaries are inclusive on the more-favourable side:
    //   >= 24 h → 100%, >= 12 h → 50%, < 12 h → 0%
    const refundPercent = hoursUntilSession >= 24 ? 100
                        : hoursUntilSession >= 12 ? 50
                        : 0;

    console.log(`[cancelBooking] booking=${booking.id} status=${booking.status} hoursUntilSession=${hoursUntilSession.toFixed(4)} refundPercent=${refundPercent}% wasConfirmed=${wasConfirmed} paymentIntentId=${booking.stripe_payment_intent_id} chargeId=${booking.stripe_charge_id}`);

    // ── Cancel the booking ──────────────────────────────────────────────────
    // transfer_status → 'skipped' prevents the transfer cron from paying out
    // a cancelled session even if transfer_due_at has already passed.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status:              'CANCELLED',
        cancellation_reason: reason.trim(),
        cancelled_at:        cancelledAt,   // request-received time, not now()
        transfer_status:     'skipped',
      },
    });
    console.log(`[cancelBooking] booking=${booking.id} marked CANCELLED`);

    // ── Initiate Stripe refund based on tier ────────────────────────────────
    // Idempotency key: stable per booking + refund tier so a network-timeout
    // retry always returns the same Stripe refund object, never a duplicate.
    let refundInitiated = false;
    if (refundPercent > 0 && wasConfirmed && booking.stripe_payment_intent_id) {
      console.log(`[cancelBooking] Initiating ${refundPercent}% refund for booking=${booking.id}`);
      try {
        let chargeId = booking.stripe_charge_id;
        if (!chargeId) {
          console.log(`[cancelBooking] No stored chargeId — retrieving from PaymentIntent ${booking.stripe_payment_intent_id}`);
          const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          chargeId = pi.latest_charge;
          console.log(`[cancelBooking] Retrieved chargeId=${chargeId}`);
        }
        if (chargeId) {
          const refundAmountPence     = Math.round(Number(booking.amount) * 100 * refundPercent / 100);
          const shouldReverseTransfer = booking.transfer_status !== 'completed';
          const idempotencyKey        = `booking-${booking.id}-cancel-${refundPercent}pct`;

          const { refund: stripeRefund, platformFunded } = await createRefundWithFallback({
            bookingId:             booking.id,
            chargeId,
            amountPence:           refundAmountPence,
            idempotencyKey,
            shouldReverseTransfer,
          });

          refundInitiated = true;
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              stripe_refund_id:    stripeRefund.id,
              refund_status:       stripeRefund.status,
              refund_amount:       refundAmountPence / 100,
              refunded_at:         new Date(),
              ...(platformFunded ? {
                internal_admin_note: `Platform-funded refund (${refundPercent}%): expert transfer reversal failed — expert balance recovery required.`,
              } : {}),
            },
          });
          if (platformFunded) {
            logAudit(req.user.id, 'REFUND_PLATFORM_FUNDED', 'PARENT', booking.expert_id,
              `Booking #${booking.id}: ${refundPercent}% refund platform-funded — expert balance/account issue. Manual recovery needed.`);
          }
          console.log(`[cancelBooking] Stripe refund ${stripeRefund.id} (${refundAmountPence}p, ${refundPercent}%) — platform_funded=${platformFunded}`);
        } else {
          console.warn(`[cancelBooking] No chargeId found — refund skipped for booking=${booking.id}`);
        }
      } catch (stripeErr) {
        // Refund failure must not block the cancellation — booking is already CANCELLED.
        // Admin must manually process the refund.
        console.error('[cancelBooking] Stripe refund failed:', stripeErr.message, stripeErr.code);
        await prisma.booking.update({
          where: { id: booking.id },
          data: { internal_admin_note: `Stripe refund failed (${stripeErr.code || stripeErr.message}) — manual refund required.` },
        }).catch(() => {});
      }
    } else {
      console.log(`[cancelBooking] No refund — refundPercent=${refundPercent}% wasConfirmed=${wasConfirmed} hasPaymentIntent=${!!booking.stripe_payment_intent_id}`);
    }

    // ── Audit trail ────────────────────────────────────────────────────────
    logAudit(req.user.id, 'BOOKING_CANCELLED', 'PARENT', req.user.id,
      `Booking #${booking.id} cancelled · ${refundPercent}% refund`);
    if (refundInitiated) {
      const refundAmountGbp = (Number(booking.amount) * refundPercent / 100).toFixed(2);
      logAudit(req.user.id, 'REFUND_ISSUED', 'PARENT', req.user.id,
        `Booking #${booking.id} · £${refundAmountGbp} refunded (${refundPercent}%)`);
    }

    // ── Notify expert immediately ───────────────────────────────────────────
    sendBookingCancellationNotification({
      to:                 booking.expert.user.email,
      expertName:         booking.expert.user.name,
      parentName:         booking.parent.name,
      serviceTitle:       booking.service.title,
      format:             booking.format,
      scheduledAt:        booking.scheduled_at,
      cancellationReason: reason || null,
      refundPercent,
      amount:             booking.amount,
      currency:           booking.currency || 'EUR',
      timezone:           booking.expert.timezone,
    }).catch((e) => console.error('[Email] Cancellation notification failed:', e.message));

    return res.json({ success: true, refund_initiated: refundInitiated, refund_percent: refundPercent });
  } catch (err) {
    console.error('[cancelBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /bookings/:id/reschedule — parent moves booking to a new slot ─────
//
// Rules:
//   • Only CONFIRMED bookings can be rescheduled
//   • Must be > 12 h before the CURRENT session start (same lockout as cancel)
//   • New slot must be different from the current slot
//   • No payment change: no new charge, no refund — Stripe is never touched
//   • is_reschedule is set to true so the audit trail is clear and the cancel
//     refund logic can never misfire during a reschedule operation
//   • Reminder flags are reset so reminders fire correctly for the new time
//   • transfer_due_at is recalculated for the new session end time
//
async function rescheduleBooking(req, res) {
  const { id } = req.params;
  const { newScheduledAt } = req.body;

  if (!newScheduledAt) {
    return res.status(400).json({ error: 'newScheduledAt is required' });
  }

  const newDate = new Date(newScheduledAt);
  if (isNaN(newDate.getTime())) {
    return res.status(400).json({ error: 'Invalid newScheduledAt date' });
  }
  if (newDate <= new Date()) {
    return res.status(400).json({ error: 'New scheduled time must be in the future' });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { name: true, email: true, notify_reschedule: true } },
        expert:  { select: { address_street: true, address_city: true, address_postcode: true, user: { select: { name: true, email: true } } } },
        service: { select: { title: true, duration_minutes: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({ error: 'Only confirmed bookings can be rescheduled' });
    }

    // Enforce the 12 h window using the same boundary as cancellation
    const hoursUntilCurrent = (booking.scheduled_at.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilCurrent < 12) {
      return res.status(400).json({ error: 'Bookings cannot be rescheduled within 12 hours of the session' });
    }

    // Prevent no-op reschedules
    if (booking.scheduled_at.getTime() === newDate.getTime()) {
      return res.status(400).json({ error: 'New time must be different from the current session time' });
    }

    // Check the target slot is free for this expert (any status — unique constraint
    // on expert_id + scheduled_at applies table-wide, so even CANCELLED rows block)
    const conflict = await prisma.booking.findFirst({
      where: {
        expert_id:    booking.expert_id,
        scheduled_at: newDate,
        id:           { not: booking.id },
      },
    });
    if (conflict) {
      return res.status(409).json({ error: 'That time slot is no longer available. Please choose another.' });
    }

    // Recalculate transfer_due_at for the new session end time
    const newSessionEnd    = new Date(newDate.getTime() + booking.duration_minutes * 60 * 1000);
    const newTransferDueAt = new Date(newSessionEnd.getTime() + 24 * 60 * 60 * 1000);

    const previousScheduledAt = booking.scheduled_at;
    const now = new Date();
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        scheduled_at:      newDate,
        is_reschedule:     true,        // guards against refund logic misfiring
        rescheduled_at:    now,
        transfer_due_at:   newTransferDueAt,
        reminder_1h_sent:  false,       // reset so reminders fire for the new time
        reminder_24h_sent: false,
      },
    });

    console.log(`[rescheduleBooking] booking=${booking.id} rescheduled ${booking.scheduled_at.toISOString()} → ${newDate.toISOString()}`);

    // ── Notify parent (updated confirmation) ───────────────────────────────
    const expertAddress = [booking.expert.address_street, booking.expert.address_city, booking.expert.address_postcode].filter(Boolean).join(', ');
    if (booking.parent.notify_reschedule !== false) {
      sendBookingConfirmationEmail({
        to:              booking.parent.email,
        name:            booking.parent.name,
        expertName:      booking.expert.user.name,
        serviceTitle:    booking.service.title,
        format:          booking.format,
        scheduledAt:     newDate,
        durationMinutes: booking.duration_minutes,
        location:        booking.format === 'IN_PERSON' ? (expertAddress || undefined) : undefined,
      }).catch((e) => console.error('[Email] Reschedule parent confirmation failed:', e.message));
    }

    // ── Notify expert (reschedule-specific notification) ───────────────────
    sendRescheduleNotificationEmail({
      to:                  booking.expert.user.email,
      expertName:          booking.expert.user.name,
      parentName:          booking.parent.name,
      parentEmail:         booking.parent.email,
      serviceTitle:        booking.service.title,
      format:              booking.format,
      previousScheduledAt,
      newScheduledAt:      newDate,
      durationMinutes:     booking.duration_minutes,
      bookingId:           booking.id,
    }).catch((e) => console.error('[Email] Reschedule expert notification failed:', e.message));

    return res.json({ success: true, scheduled_at: newDate.toISOString() });
  } catch (err) {
    if (err.code === 'P2002') {
      // Unique constraint race — another booking was created between our check and update
      return res.status(409).json({ error: 'That time slot is no longer available. Please choose another.' });
    }
    console.error('[rescheduleBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/upcoming — next 10 upcoming CONFIRMED bookings (expert) ───
async function getUpcomingAppointments(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: {
        expert_id,
        scheduled_at: { gt: now },
        status: 'CONFIRMED',
      },
      orderBy: { scheduled_at: 'asc' },
      take: 10,
      include: {
        parent:  { select: { name: true, email: true } },
        service: { select: { title: true, duration_minutes: true, format: true } },
      },
    });

    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/calendar — CONFIRMED bookings in date range (expert view) ──
async function getCalendarBookings(req, res) {
  const { from, to } = req.query;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const where = {
      expert_id,
      status: 'CONFIRMED', // only confirmed bookings appear on calendar
    };

    if (from || to) {
      where.scheduled_at = {};
      if (from) where.scheduled_at.gte = new Date(from);
      if (to)   where.scheduled_at.lte = new Date(to);
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { scheduled_at: 'asc' },
      include: {
        parent:  { select: { name: true, email: true } },
        service: { select: { title: true, format: true } },
      },
    });

    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /bookings/:id/complete — save expert session note (status unchanged) ─
// Status is managed automatically by the markCompletedBookings cron job.
async function markBookingComplete(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.expert_id !== expert_id) return res.status(403).json({ error: 'Access denied' });
    if (!['CONFIRMED', 'COMPLETED'].includes(booking.status)) {
      return res.status(400).json({ error: 'Notes can only be added to confirmed or completed bookings' });
    }

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data:  { expert_note: note.trim() || null },
    });
    return res.json({
      status:      updated.status,
      expert_note: updated.expert_note,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /bookings/:id/expert-note — save/update expert private notes ───────
async function saveExpertNote(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.expert_id !== expert_id) return res.status(403).json({ error: 'Access denied' });

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data:  { expert_note: note.trim() || null },
    });
    return res.json({ expert_note: updated.expert_note });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/past — paginated session history for the expert ────────────
async function getPastAppointments(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip  = (page - 1) * limit;
    const now   = new Date();

    const where = {
      expert_id,
      OR: [
        { status: 'CONFIRMED',  scheduled_at: { lt: now } },
        { status: 'COMPLETED' },
        { status: 'CANCELLED' },
        { status: 'REFUNDED'  },
      ],
    };

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        orderBy: { scheduled_at: 'desc' },
        skip,
        take: limit,
        include: {
          parent:  { select: { name: true, email: true } },
          service: { select: { title: true, duration_minutes: true } },
        },
      }),
    ]);

    return res.json({ bookings, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /bookings/:id/verify-payment — reconcile if webhook was missed ──────
//
// Called by BookingStatusPage after polling times out with status still
// PENDING_PAYMENT. Checks the PaymentIntent status directly with Stripe
// and confirms the booking if the payment succeeded.  Safe to call multiple
// times — the status guard makes it idempotent.
//
async function verifyPayment(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { id: true, name: true, email: true, notify_booking_confirmation: true } },
        expert:  { select: { address_street: true, address_city: true, address_postcode: true, user: { select: { name: true, email: true } } } },
        service: { select: { title: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parent_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Already resolved — nothing to do
    if (booking.status !== 'PENDING_PAYMENT') {
      return res.json({ status: booking.status });
    }

    if (!booking.stripe_payment_intent_id) {
      return res.status(400).json({ error: 'No payment intent on record for this booking' });
    }

    const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);

    if (pi.status !== 'succeeded') {
      // Payment genuinely not completed — return current state
      return res.json({ status: booking.status, pi_status: pi.status });
    }

    // Payment succeeded but webhook was missed — self-heal
    console.log(`[verifyPayment] Reconciling booking ${booking.id} — PI ${pi.id} succeeded but webhook not received`);

    const sessionEndTime  = new Date(booking.scheduled_at.getTime() + booking.duration_minutes * 60 * 1000);
    const transferDueAt   = new Date(sessionEndTime.getTime() + 24 * 60 * 60 * 1000);

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status:           'CONFIRMED',
        stripe_charge_id: pi.latest_charge || null,
        transfer_status:  'pending',
        transfer_due_at:  transferDueAt,
      },
    });

    logAudit(booking.parent_id, 'BOOKING_CONFIRMED', 'PARENT', booking.parent_id,
      `Booking #${booking.id} confirmed (reconciled)`);

    // Fire confirmation emails (same as webhook handler)
    const expertAddressVerify = [booking.expert.address_street, booking.expert.address_city, booking.expert.address_postcode].filter(Boolean).join(', ');
    if (booking.parent.notify_booking_confirmation !== false) {
      sendBookingConfirmationEmail({
        to:              booking.parent.email,
        name:            booking.parent.name,
        expertName:      booking.expert.user.name,
        serviceTitle:    booking.service.title,
        format:          booking.format,
        scheduledAt:     booking.scheduled_at,
        durationMinutes: booking.duration_minutes,
        location:        booking.format === 'IN_PERSON' ? (expertAddressVerify || undefined) : undefined,
      }).catch((e) => console.error('[verifyPayment] Parent confirmation email failed:', e.message));
    }

    sendNewBookingNotificationEmail({
      to:              booking.expert.user.email,
      expertName:      booking.expert.user.name,
      parentName:      booking.parent.name,
      parentEmail:     booking.parent.email,
      serviceTitle:    booking.service.title,
      format:          booking.format,
      scheduledAt:     booking.scheduled_at,
      durationMinutes: booking.duration_minutes,
      bookingId:       booking.id,
    }).catch((e) => console.error('[verifyPayment] Expert notification email failed:', e.message));

    return res.json({ status: 'CONFIRMED' });
  } catch (err) {
    console.error('[verifyPayment]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /bookings/:id/link-sent — expert marks session link as sent ───────
async function markSessionLinkSent(req, res) {
  const { id } = req.params;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });
    if (!booking || booking.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { session_link_sent: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /bookings/:id/expert-cancel — expert cancels a confirmed booking ─────
//
// Always issues a full refund regardless of timing, then emails the parent.
//
async function expertCancelBooking(req, res) {
  const { id } = req.params;
  const cancelledAt = new Date();

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { name: true, email: true, notify_expert_cancellation: true } },
        expert:  { select: { user_id: true, user: { select: { name: true, email: true } } } },
        service: { select: { title: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Only the expert who owns this booking can cancel it
    if (booking.expert.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(booking.status)) {
      return res.status(400).json({ error: `Booking cannot be cancelled (current status: ${booking.status})` });
    }

    let stripeRefund  = null;
    let platformFunded = false;
    const refundedAmount = parseFloat(booking.amount) || 0;

    if (booking.status === 'CONFIRMED' && booking.stripe_payment_intent_id) {
      let chargeId = booking.stripe_charge_id;
      if (!chargeId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          chargeId = pi.latest_charge;
        } catch (piErr) {
          console.error('[expertCancelBooking] Failed to retrieve PaymentIntent:', piErr.message);
        }
      }
      if (chargeId) {
        // Expert cancellations always issue a full refund (no amount = full charge).
        // Idempotency key is stable per booking so a retry returns the same refund.
        try {
          const result = await createRefundWithFallback({
            bookingId:             booking.id,
            chargeId,
            amountPence:           undefined, // full refund
            idempotencyKey:        `booking-${booking.id}-expert-cancel`,
            shouldReverseTransfer: booking.transfer_status !== 'completed',
          });
          stripeRefund   = result.refund;
          platformFunded = result.platformFunded;
        } catch (refundErr) {
          // Refund failure must NOT block the cancellation — the booking is still
          // marked CANCELLED below. Admin must manually process the refund.
          console.error('[expertCancelBooking] Stripe refund failed:', refundErr.message, refundErr.code);
          await prisma.booking.update({
            where: { id: booking.id },
            data: { internal_admin_note: `Expert cancel: Stripe refund failed (${refundErr.code || refundErr.message}) — manual full refund required for parent.` },
          }).catch(() => {});
        }
      }
    } else if (booking.status === 'PENDING_PAYMENT' && booking.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      } catch (_) { /* may already be expired */ }
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status:              booking.status === 'CONFIRMED' ? 'REFUNDED' : 'CANCELLED',
        cancellation_reason: 'Cancelled by expert',
        cancelled_at:        cancelledAt,
        transfer_status:     'skipped',
        ...(stripeRefund ? {
          stripe_refund_id: stripeRefund.id,
          refund_status:    stripeRefund.status,
          refund_amount:    refundedAmount,
          refunded_at:      new Date(),
          ...(platformFunded ? {
            internal_admin_note: 'Expert cancel: platform-funded full refund — expert balance/account issue. Manual recovery required.',
          } : {}),
        } : {}),
      },
    });

    console.log(`[expertCancelBooking] booking=${booking.id} cancelled by expert user=${req.user.id} refund=${stripeRefund?.id || 'none'} platform_funded=${platformFunded}`);

    logAudit(req.user.id, 'BOOKING_CANCELLED_BY_EXPERT', 'PARENT', booking.parent_id,
      `Booking #${booking.id} cancelled by specialist${stripeRefund ? ' · full refund issued' : ' · refund pending manual action'}`);
    if (platformFunded) {
      logAudit(req.user.id, 'REFUND_PLATFORM_FUNDED', 'PARENT', booking.expert_id,
        `Booking #${booking.id}: expert-cancel full refund platform-funded — expert balance/account issue. Manual recovery needed.`);
    }

    // Email the parent — fire-and-forget
    if (booking.status === 'CONFIRMED' && booking.parent.notify_expert_cancellation !== false) {
      sendExpertCancelledSessionEmail({
        to:           booking.parent.email,
        parentName:   booking.parent.name,
        expertName:   booking.expert.user.name,
        serviceTitle: booking.service.title,
        scheduledAt:  booking.scheduled_at,
        amount:       refundedAmount,
        currency:     booking.currency || 'EUR',
      }).catch((e) => console.error('[Email] Expert cancel parent email failed:', e.message));
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[expertCancelBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /bookings/:id/abandon — parent exits checkout, releases the slot ────
//
// Called when the parent clicks "Edit booking" on the payment screen.
// Cancels the Stripe PaymentIntent (so no money is collected) and deletes the
// PENDING_PAYMENT booking row so the slot is immediately available for others.
// Deletion (not cancellation) is intentional — same pattern as PaymentIntent
// failure cleanup — so the unique-constraint slot is truly freed.
//
async function abandonBooking(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (booking.status !== 'PENDING_PAYMENT') {
      return res.status(400).json({ error: 'Only pending-payment bookings can be abandoned' });
    }

    // Cancel the PaymentIntent so Stripe never charges the card
    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      } catch (e) {
        // PI may already be expired/cancelled — log and continue
        console.warn(`[abandonBooking] PI cancel skipped for ${booking.stripe_payment_intent_id}:`, e.message);
      }
    }

    // Delete the row — frees the unique (expert_id, scheduled_at) slot
    await prisma.booking.delete({ where: { id: booking.id } });

    console.log(`[abandonBooking] booking=${booking.id} deleted — slot released for parent=${req.user.id}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('[abandonBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /bookings/tc-version ─────────────────────────────────────────────────
// Returns whether this user must explicitly accept T&C before booking.
// Triggers for two cases:
//   1. Never accepted T&C at all (neither at registration nor in a prior booking)
//   2. T&C was updated since their last acceptance (registration or booking)
async function getCurrentTcVersion(req, res) {
  try {
    const [currentTc, lastBookingAccepted, lastRegAccepted] = await Promise.all([
      prisma.legalDocument.findFirst({
        where: { type: 'TERMS_CONDITIONS' },
        orderBy: { effective_from: 'desc' },
      }),
      // Per-booking acceptances (TcAcceptance)
      prisma.tcAcceptance.findFirst({
        where: { user_id: req.user.id },
        orderBy: { accepted_at: 'desc' },
        select: { version: true },
      }),
      // Registration-time acceptance (stored in PrivacyPolicyAcceptance.tc_version)
      prisma.privacyPolicyAcceptance.findFirst({
        where: { user_id: req.user.id, tc_version: { not: null } },
        orderBy: { accepted_at: 'desc' },
        select: { tc_version: true },
      }),
    ]);

    // Use the most recent T&C version the user has ever accepted, from either source
    const lastAcceptedVersion =
      lastBookingAccepted?.version ?? lastRegAccepted?.tc_version ?? null;

    const isFirstBooking  = !lastAcceptedVersion;
    const versionUpdated  = !!(currentTc && lastAcceptedVersion && lastAcceptedVersion !== currentTc.version);

    return res.json({
      version:          currentTc?.version ?? null,
      version_updated:  currentTc ? (isFirstBooking || versionUpdated) : false,
      is_first_booking: isFirstBooking,
    });
  } catch (err) {
    console.error('[getCurrentTcVersion] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /bookings/accept-tc ─────────────────────────────────────────────────
// Records the parent's acceptance of the current T&C version.
// Idempotent — safe to call multiple times for the same version.
async function acceptTc(req, res) {
  try {
    const currentTc = await prisma.legalDocument.findFirst({
      where: { type: 'TERMS_CONDITIONS' },
      orderBy: { effective_from: 'desc' },
    });
    if (!currentTc) {
      return res.status(404).json({ error: 'No Terms & Conditions document found.' });
    }

    await prisma.tcAcceptance.upsert({
      where:  { user_id_version: { user_id: req.user.id, version: currentTc.version } },
      create: { user_id: req.user.id, version: currentTc.version },
      update: {},
    });

    logAudit(req.user.id, 'TC_ACCEPTED', 'PARENT', req.user.id,
      `T&C v${currentTc.version} accepted`);

    return res.json({ accepted: true, version: currentTc.version });
  } catch (err) {
    console.error('[acceptTc] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createBooking,
  getBookingById,
  getMyBookings,
  verifyPayment,
  cancelBooking,
  abandonBooking,
  rescheduleBooking,
  expertCancelBooking,
  getUpcomingAppointments,
  getPastAppointments,
  getCalendarBookings,
  markSessionLinkSent,
  markBookingComplete,
  saveExpertNote,
  getCurrentTcVersion,
  acceptTc,
};
