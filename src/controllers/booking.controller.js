const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
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

// ─── POST /bookings — parent creates a booking + payment intent ───────────────
//
// Body: { expertId, serviceId, scheduledAt (ISO string), format }
// Returns: { bookingId, clientSecret }
//
async function createBooking(req, res) {
  const { expertId, serviceId, scheduledAt, format, tcAccepted } = req.body;

  if (!expertId || !serviceId || !scheduledAt || !format) {
    return res.status(400).json({ error: 'expertId, serviceId, scheduledAt, and format are required' });
  }

  // GDPR hard block — T&Cs must be accepted before a PaymentIntent is created
  if (tcAccepted !== true) {
    return res.status(400).json({ error: 'You must accept the Terms & Conditions to proceed with payment.' });
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
    if (!expert.stripe_account_id) {
      return res.status(400).json({ error: 'Expert has not connected their Stripe account yet' });
    }

    // ── Load service ────────────────────────────────────────────────────────
    const service = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
    if (!service || service.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (!service.is_active) {
      return res.status(400).json({ error: 'This service is no longer available' });
    }

    // ── Create booking atomically (unique constraint prevents double booking) ─
    // The @@unique([expert_id, scheduled_at]) constraint is the single source of
    // truth for concurrency. Abandoned/failed bookings are DELETED (not CANCELLED)
    // so the unique slot is freed and another parent can book it.
    const platformFee = (Number(service.price) * 0.20).toFixed(2);

    let booking;
    try {
      booking = await prisma.booking.create({
        data: {
          expert_id:        expert.id,
          parent_id:        req.user.id,
          service_id:       service.id,
          scheduled_at:     scheduledDate,
          duration_minutes: service.duration_minutes,
          format,
          status:           'PENDING_PAYMENT',
          amount:           service.price,
          platform_fee:     platformFee,
        },
      });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'This time slot is no longer available. Please choose another.' });
      }
      throw err;
    }

    // ── Create Stripe PaymentIntent ─────────────────────────────────────────
    // Amount in pence (GBP) — price is stored as Decimal.
    // We use transfer_group (no transfer_data) so funds land in the platform
    // account first. The processTransfers cron job creates the actual transfer
    // to the expert 24h after the session ends, keeping the platform fee.
    const amountInPence = Math.round(Number(service.price) * 100);

    console.log(`[Payment] Creating PaymentIntent — booking=${booking.id} expert=${expert.id} amount=${amountInPence}p transfer_group=${booking.id}`);

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount:         amountInPence,
        currency:       'gbp',
        transfer_group: String(booking.id),
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

    // ── Store T&C acceptance — per booking as required by client ────────────
    const currentTc = await prisma.legalDocument.findFirst({
      where: { type: 'TERMS_CONDITIONS' },
      orderBy: { effective_from: 'desc' },
    });
    await prisma.tcAcceptance.create({
      data: {
        user_id:    req.user.id,
        booking_id: booking.id,
        version:    currentTc?.version ?? '1.0',
      },
    });

    console.log(`[Payment] Booking ${booking.id} ready — clientSecret issued to parent`);

    return res.status(201).json({
      bookingId:    booking.id,
      clientSecret: paymentIntent.client_secret,
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
      orderBy: { scheduled_at: 'desc' },
      include: {
        expert:  { select: { profile_image: true, user: { select: { name: true, account_deleted: true } } } },
        service: { select: { title: true, duration_minutes: true } },
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
        cancellation_reason: reason || null,
        cancelled_at:        cancelledAt,   // request-received time, not now()
        transfer_status:     'skipped',
      },
    });
    console.log(`[cancelBooking] booking=${booking.id} marked CANCELLED`);

    // ── Initiate Stripe refund based on tier ────────────────────────────────
    // Use stored stripe_charge_id to avoid an extra Stripe API call.
    // Fall back to retrieving from the PaymentIntent for older bookings that
    // predate the stripe_charge_id storage (migration safety).
    // Always pass an explicit amount so Stripe creates a partial refund correctly.
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
          // Compute the exact pence amount to refund so both 100% and 50%
          // go through the same code path, reducing the risk of silent errors.
          const refundAmountPence = Math.round(Number(booking.amount) * 100 * refundPercent / 100);
          await stripe.refunds.create({ charge: chargeId, amount: refundAmountPence });
          refundInitiated = true;
          console.log(`[cancelBooking] Stripe refund of ${refundAmountPence}p created for chargeId=${chargeId} — waiting for charge.refunded webhook`);
        } else {
          console.warn(`[cancelBooking] No chargeId found — refund skipped for booking=${booking.id}`);
        }
      } catch (stripeErr) {
        // Refund failure must not block the cancellation response
        console.error('[cancelBooking] Stripe refund failed:', stripeErr.message);
      }
    } else {
      console.log(`[cancelBooking] No refund — refundPercent=${refundPercent}% wasConfirmed=${wasConfirmed} hasPaymentIntent=${!!booking.stripe_payment_intent_id}`);
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
        parent:  { select: { name: true, email: true } },
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
    sendBookingConfirmationEmail({
      to:              booking.parent.email,
      name:            booking.parent.name,
      expertName:      booking.expert.user.name,
      serviceTitle:    booking.service.title,
      format:          booking.format,
      scheduledAt:     newDate,
      durationMinutes: booking.duration_minutes,
      location:        expertAddress || undefined,
    }).catch((e) => console.error('[Email] Reschedule parent confirmation failed:', e.message));

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
        parent:  { select: { id: true, name: true, email: true } },
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

    // Fire confirmation emails (same as webhook handler)
    const expertAddressVerify = [booking.expert.address_street, booking.expert.address_city, booking.expert.address_postcode].filter(Boolean).join(', ');
    sendBookingConfirmationEmail({
      to:              booking.parent.email,
      name:            booking.parent.name,
      expertName:      booking.expert.user.name,
      serviceTitle:    booking.service.title,
      format:          booking.format,
      scheduledAt:     booking.scheduled_at,
      durationMinutes: booking.duration_minutes,
      location:        expertAddressVerify || undefined,
    }).catch((e) => console.error('[verifyPayment] Parent confirmation email failed:', e.message));

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

    return res.json({ status: 'CONFIRMED', reconciled: true });
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
        parent:  { select: { name: true, email: true } },
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

    let stripeRefund = null;
    const refundedAmount = parseFloat(booking.amount) || 0;

    if (booking.status === 'CONFIRMED' && booking.stripe_payment_intent_id) {
      let chargeId = booking.stripe_charge_id;
      if (!chargeId) {
        const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
        chargeId = pi.latest_charge;
      }
      if (chargeId) {
        // Expert cancellations always receive a full refund — no partial tiers
        stripeRefund = await stripe.refunds.create({ charge: chargeId });
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
        } : {}),
      },
    });

    console.log(`[expertCancelBooking] booking=${booking.id} cancelled by expert user=${req.user.id} refund=${stripeRefund?.id || 'none'}`);

    // Email the parent — fire-and-forget
    if (booking.status === 'CONFIRMED') {
      sendExpertCancelledSessionEmail({
        to:           booking.parent.email,
        parentName:   booking.parent.name,
        expertName:   booking.expert.user.name,
        serviceTitle: booking.service.title,
        scheduledAt:  booking.scheduled_at,
        amount:       refundedAmount,
      }).catch((e) => console.error('[Email] Expert cancel parent email failed:', e.message));
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[expertCancelBooking] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createBooking,
  getBookingById,
  getMyBookings,
  verifyPayment,
  cancelBooking,
  rescheduleBooking,
  expertCancelBooking,
  getUpcomingAppointments,
  getCalendarBookings,
  markSessionLinkSent,
};
