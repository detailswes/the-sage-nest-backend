const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { sendBookingCancellationNotification } = require('../utils/email');

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
        expert:  { include: { user: { select: { id: true, name: true } } } },
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
        expert:  { select: { profile_image: true, user: { select: { name: true } } } },
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
// Policy:
//   ≥ 24 h before session → cancel + initiate Stripe refund + notify expert
//   < 24 h before session → cancel + no refund             + notify expert
//
async function cancelBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

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

    const now = new Date();
    const hoursUntilSession = (booking.scheduled_at.getTime() - now.getTime()) / (1000 * 60 * 60);
    const withinFreeWindow  = hoursUntilSession >= 24;
    const wasConfirmed      = booking.status === 'CONFIRMED';

    // ── Cancel the booking ──────────────────────────────────────────────────
    // transfer_status → 'skipped' prevents the transfer cron from paying out
    // a cancelled session even if transfer_due_at has already passed.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status:              'CANCELLED',
        cancellation_reason: reason || null,
        cancelled_at:        now,
        transfer_status:     'skipped',
      },
    });

    // ── Initiate Stripe refund if within free window and payment was made ───
    // Use stored stripe_charge_id to avoid an extra Stripe API call.
    // Fall back to retrieving from the PaymentIntent for older bookings that
    // predate the stripe_charge_id storage (migration safety).
    let refundInitiated = false;
    if (withinFreeWindow && wasConfirmed && booking.stripe_payment_intent_id) {
      try {
        let chargeId = booking.stripe_charge_id;
        if (!chargeId) {
          const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
          chargeId = pi.latest_charge;
        }
        if (chargeId) {
          await stripe.refunds.create({ charge: chargeId });
          refundInitiated = true;
          // The charge.refunded webhook will later update status → REFUNDED
        }
      } catch (stripeErr) {
        // Refund failure must not block the cancellation response
        console.error('[cancelBooking] Stripe refund failed:', stripeErr.message);
      }
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
      withinFreeWindow,
    }).catch((e) => console.error('[Email] Cancellation notification failed:', e.message));

    return res.json({ success: true, refund_initiated: refundInitiated });
  } catch (err) {
    console.error('[cancelBooking] Error:', err);
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
        parent:  { select: { name: true } },
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
        parent:  { select: { name: true } },
        service: { select: { title: true, format: true } },
      },
    });

    return res.json(bookings);
  } catch (err) {
    console.error(err);
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

module.exports = {
  createBooking,
  getBookingById,
  getMyBookings,
  cancelBooking,
  getUpcomingAppointments,
  getCalendarBookings,
  markSessionLinkSent,
};
