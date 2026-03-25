const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const {
  sendBookingConfirmationEmail,
  sendNewBookingNotificationEmail,
} = require('../utils/email');

// ─── Step 1 & 2: Expert clicks connect — create Stripe onboarding link ────────
async function createConnectLink(req, res) {
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    let accountId = expert.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      accountId = account.id;
      await prisma.expert.update({
        where: { id: expert.id },
        data: { stripe_account_id: accountId },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.CLIENT_URL}/stripe/refresh`,
      return_url: `${process.env.CLIENT_URL}/stripe/return`,
      type: 'account_onboarding',
    });

    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create Stripe connect link' });
  }
}

// ─── Step 4 & 5: Stripe returns to platform — verify onboarding completion ───
async function handleStripeReturn(req, res) {
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert || !expert.stripe_account_id) {
      return res.status(400).json({ error: 'No Stripe account found' });
    }

    const account = await stripe.accounts.retrieve(expert.stripe_account_id);
    const onboardingComplete = account.details_submitted;

    // Persist the completion flag so listExperts can filter without a Stripe call
    if (onboardingComplete && !expert.stripe_onboarding_complete) {
      await prisma.expert.update({
        where: { id: expert.id },
        data: { stripe_onboarding_complete: true },
      });
    }

    return res.json({
      stripe_account_id: expert.stripe_account_id,
      onboarding_complete: onboardingComplete,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not verify Stripe account' });
  }
}

// ─── Webhook: single source of truth for all payment outcomes ────────────────
//
// Called from stripe.webhook.routes.js which already applies express.raw().
// Signature verification + idempotency guard ensure each event is processed
// exactly once even under duplicate / out-of-order deliveries.
//
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  console.log(`[Webhook] Received request — sig present: ${!!sig} body bytes: ${req.body?.length ?? 0}`);

  if (!sig) {
    console.error('[Webhook] Missing stripe-signature header');
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set in environment');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                              // raw Buffer — provided by express.raw()
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[Webhook] Signature verified — event type: ${event.type} id: ${event.id}`);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ── Idempotency guard: skip already-processed events ────────────────────────
  try {
    await prisma.stripeEvent.create({ data: { stripe_event_id: event.id } });
  } catch (err) {
    // Unique constraint violation — event already processed
    if (err.code === 'P2002') {
      console.log(`[Webhook] Duplicate event skipped: ${event.id}`);
      return res.json({ received: true, duplicate: true });
    }
    console.error('[Webhook] DB error recording event:', err);
    return res.status(500).json({ error: 'Server error' });
  }

  console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {

      // ── Payment succeeded: confirm the booking and send email ──────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        console.log(`[Webhook] payment_intent.succeeded — pi=${pi.id} amount=${pi.amount}`);

        const booking = await prisma.booking.findFirst({
          where: { stripe_payment_intent_id: pi.id },
          include: {
            parent:  { select: { name: true, email: true } },
            expert:  { include: { user: { select: { name: true, email: true } } } },
            service: { select: { title: true } },
          },
        });

        if (!booking) {
          console.warn(`[Webhook] payment_intent.succeeded — no booking found for pi=${pi.id}`);
          break;
        }

        console.log(`[Webhook] Found booking ${booking.id} with status=${booking.status}`);

        if (booking.status === 'PENDING_PAYMENT') {
          // transfer_due_at = session end time + 24 hours
          const sessionEndTime = new Date(
            booking.scheduled_at.getTime() + booking.duration_minutes * 60 * 1000
          );
          const transferDueAt = new Date(sessionEndTime.getTime() + 24 * 60 * 60 * 1000);

          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status:           'CONFIRMED',
              stripe_charge_id: pi.latest_charge || null,
              transfer_status:  'pending',
              transfer_due_at:  transferDueAt,
            },
          });
          console.log(
            `[Webhook] Booking ${booking.id} → CONFIRMED | ` +
            `charge=${pi.latest_charge} transfer_due=${transferDueAt.toISOString()}`
          );

          // Fire-and-forget: parent confirmation + expert new-booking notification
          sendBookingConfirmationEmail({
            to:              booking.parent.email,
            name:            booking.parent.name,
            expertName:      booking.expert.user.name,
            serviceTitle:    booking.service.title,
            format:          booking.format,
            scheduledAt:     booking.scheduled_at,
            durationMinutes: booking.duration_minutes,
            amount:          booking.amount,
            bookingId:       booking.id,
          }).catch((e) => console.error('[Email] Parent confirmation email failed:', e.message));

          sendNewBookingNotificationEmail({
            to:              booking.expert.user.email,
            expertName:      booking.expert.user.name,
            parentName:      booking.parent.name,
            serviceTitle:    booking.service.title,
            format:          booking.format,
            scheduledAt:     booking.scheduled_at,
            durationMinutes: booking.duration_minutes,
            bookingId:       booking.id,
          }).catch((e) => console.error('[Email] Expert notification email failed:', e.message));
        } else {
          console.log(`[Webhook] Booking ${booking.id} already has status=${booking.status} — skipping update`);
        }
        break;
      }

      // ── Checkout session completed (Checkout Session flow — also covers PI) ─
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_intent) {
          await prisma.booking.updateMany({
            where: {
              stripe_payment_intent_id: session.payment_intent,
              status: 'PENDING_PAYMENT',
            },
            data: { status: 'CONFIRMED' },
          });
        }
        break;
      }

      // ── Payment intent canceled (e.g. by cleanup job or Stripe expiry) ──────
      case 'payment_intent.canceled': {
        const pi = event.data.object;
        console.log(`[Webhook] payment_intent.canceled — pi=${pi.id}`);
        // DELETE — no payment was made, freeing the unique slot constraint
        await prisma.booking.deleteMany({
          where: {
            stripe_payment_intent_id: pi.id,
            status: 'PENDING_PAYMENT',
          },
        });
        break;
      }

      // ── Payment failed: delete the booking — no payment was made ────────────
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.log(`[Webhook] payment_intent.payment_failed — pi=${pi.id}`);
        // DELETE — no payment was made, freeing the unique slot constraint
        // so the parent (or another parent) can retry the same slot
        await prisma.booking.deleteMany({
          where: {
            stripe_payment_intent_id: pi.id,
            status: 'PENDING_PAYMENT',
          },
        });
        break;
      }

      // ── Charge refunded: mark booking as refunded ─────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object;
        if (charge.payment_intent) {
          await prisma.booking.updateMany({
            where: { stripe_payment_intent_id: charge.payment_intent },
            data: { status: 'REFUNDED' },
          });
        }
        break;
      }

      // ── Account updated (expert onboarding / capability changes) ──────────
      case 'account.updated': {
        const account = event.data.object;
        console.log(`[Webhook] account.updated: ${account.id}, details_submitted=${account.details_submitted}`);

        // Keep DB flag in sync with Stripe's source of truth
        await prisma.expert.updateMany({
          where: { stripe_account_id: account.id },
          data:  { stripe_onboarding_complete: account.details_submitted === true },
        });
        break;
      }

      // ── Account application authorised ────────────────────────────────────
      case 'account.application.authorized': {
        console.log('[Webhook] account.application.authorized:', event.data.object);
        break;
      }

      // ── Transfer created (platform payout to expert) ──────────────────────
      case 'transfer.created': {
        const transfer = event.data.object;
        console.log(`[Webhook] transfer.created: ${transfer.id}, amount=${transfer.amount}, destination=${transfer.destination}`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event.type}:`, err);
    // Still return 200 so Stripe does not re-deliver — the event is already
    // recorded in the idempotency table and we log the error for investigation.
  }

  return res.json({ received: true });
}

module.exports = { createConnectLink, handleStripeReturn, handleWebhook };
