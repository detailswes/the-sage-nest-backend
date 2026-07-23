const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { logAudit } = require('../utils/auditLog');
const {
  sendBookingConfirmationEmail,
  sendNewBookingNotificationEmail,
  sendAdminPayoutAlert,
} = require('../utils/email');
const { getLegalDocLinks } = require('../utils/legalDocLinks');

// ─── Step 1 & 2: Expert clicks connect — create Stripe onboarding link ────────
//
// Uses the v2 Core Accounts API (POST /v2/core/accounts) — Stripe no longer
// allows v1 Express account creation for new Connect platforms. The account
// takes on two configurations: `merchant` (card_payments, matching v1's
// card_payments capability) and `recipient` (stripe_transfers, matching v1's
// transfers capability). Manual payout scheduling has no v2 equivalent yet,
// so that one setting is still applied via the v1 accounts.update endpoint,
// which remains interoperable with v2 account IDs.
async function createConnectLink(req, res) {
  try {
    const expert = await prisma.expert.findUnique({
      where: { user_id: req.user.id },
      include: {
        user: { select: { email: true } },
        business_info: { select: { entity_type: true, address_country: true } },
      },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    // v2 account creation requires identity.country up front (v1 let Stripe's
    // hosted onboarding collect it later) — pull it from Business Info, which
    // the expert must save before connecting Stripe.
    if (!expert.stripe_account_id && !expert.business_info) {
      return res.status(400).json({
        error: 'Please complete your Business Info (legal name, address, tax details) before connecting Stripe.',
      });
    }

    let accountId = expert.stripe_account_id;

    const configuration = {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    };

    if (!accountId) {
      const account = await stripe.v2.core.accounts.create({
        contact_email: expert.user.email,
        dashboard: 'express',
        configuration,
        identity: {
          country:     expert.business_info.address_country.toLowerCase(),
          entity_type: expert.business_info.entity_type === 'COMPANY' ? 'company' : 'individual',
        },
        defaults: {
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
      });
      accountId = account.id;
      await prisma.expert.update({
        where: { id: expert.id },
        data: { stripe_account_id: accountId },
      });
    } else {
      // Ensure existing connected accounts have capabilities requested.
      await stripe.v2.core.accounts.update(accountId, { configuration })
        .catch((e) => console.error('[Stripe] account update failed:', e.message));
    }

    // Manual payout scheduling isn't part of the v2 Core Accounts schema —
    // fall back to the v1 endpoint, which still accepts v2 account IDs.
    await stripe.accounts.update(accountId, {
      settings: { payouts: { schedule: { interval: 'manual' } } },
    }).catch((e) => console.error('[Stripe] payout schedule update failed:', e.message));

    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant', 'recipient'],
          refresh_url: `${process.env.CLIENT_URL}/stripe/refresh`,
          return_url: `${process.env.CLIENT_URL}/stripe/return`,
        },
      },
    });

    return res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create Stripe connect link' });
  }
}

// ─── Step 4 & 5: Stripe returns to platform — verify onboarding completion ───
//
// v2 accounts have no `details_submitted` boolean like v1. Capability status
// moves 'pending' → 'active' once Stripe finishes activating it, so 'pending'
// (as opposed to 'active', 'restricted', or absent because nothing was
// submitted yet) is the closest replacement for the old "details submitted,
// still activating" signal.
async function handleStripeReturn(req, res) {
  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert || !expert.stripe_account_id) {
      return res.status(400).json({ error: 'No Stripe account found' });
    }

    const account = await stripe.v2.core.accounts.retrieve(expert.stripe_account_id, {
      include: ['configuration.merchant', 'configuration.recipient', 'requirements'],
    });
    const cardPaymentsStatus = account.configuration?.merchant?.capabilities?.card_payments?.status;
    const transfersStatus    = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    const cardPaymentsActive = cardPaymentsStatus === 'active';
    const transfersActive    = transfersStatus === 'active';
    const onboardingComplete = cardPaymentsActive && transfersActive;
    const onboardingPending  = !onboardingComplete && (cardPaymentsStatus === 'pending' || transfersStatus === 'pending');

    if (onboardingComplete && !expert.stripe_onboarding_complete) {
      await prisma.expert.update({
        where: { id: expert.id },
        data: { stripe_onboarding_complete: true },
      });
    }

    return res.json({
      stripe_account_id:    expert.stripe_account_id,
      onboarding_complete:  onboardingComplete,
      onboarding_pending:   onboardingPending,
      card_payments_active: cardPaymentsActive,
      transfers_active:     transfersActive,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not verify Stripe account' });
  }
}

// ─── processStripeEvent ───────────────────────────────────────────────────────
//
// Pure business logic for every Stripe event type. No HTTP concerns here.
// Called by handleWebhook (live delivery) and retryFailedWebhooks (retry job).
// All handlers are idempotent: status guards prevent double-state-transitions
// even if the same event is somehow dispatched twice.
//
async function processStripeEvent(event) {
  switch (event.type) {

    // ── Payment succeeded: confirm the booking and send email ──────────────
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      console.log(`[Webhook] payment_intent.succeeded — pi=${pi.id} amount=${pi.amount}`);

      const booking = await prisma.booking.findFirst({
        where: { stripe_payment_intent_id: pi.id },
        include: {
          parent:  { select: { name: true, email: true, language: true, timezone: true, notify_booking_confirmation: true } },
          expert:  { select: { address_street: true, address_city: true, address_postcode: true, timezone: true, notify_new_booking: true, user: { select: { name: true, email: true, language: true } } } },
          service: { select: { title: true } },
          consent: { select: { language: true, withdrawal_applicable: true } },
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

        logAudit(booking.parent_id, 'BOOKING_CONFIRMED', 'PARENT', booking.parent_id,
          `Booking #${booking.id} confirmed · payment received`);

        // Fire-and-forget: parent confirmation + expert new-booking notification
        const expertAddress = [booking.expert.address_street, booking.expert.address_city, booking.expert.address_postcode].filter(Boolean).join(', ');
        if (booking.parent.notify_booking_confirmation !== false) {
          const confirmationLanguage = booking.consent?.language || booking.parent.language || 'en';
          getLegalDocLinks(confirmationLanguage).then((legalLinks) => {
            sendBookingConfirmationEmail({
              to:              booking.parent.email,
              name:            booking.parent.name,
              expertName:      booking.expert.user.name,
              serviceTitle:    booking.service.title,
              format:          booking.format,
              scheduledAt:     booking.scheduled_at,
              durationMinutes: booking.duration_minutes,
              location:        booking.format === 'IN_PERSON' ? (expertAddress || undefined) : undefined,
              language:        confirmationLanguage,
              amount:          booking.amount,
              currency:        booking.currency,
              userTimezone:    booking.parent.timezone || booking.expert.timezone,
              withdrawalApplicable: booking.consent?.withdrawal_applicable,
              bookingId:       booking.id,
              ...legalLinks,
            });
          }).catch((e) => console.error('[Email] Parent confirmation email failed:', e.message));
        }

        if (booking.expert.notify_new_booking !== false) {
          const expertLanguage = booking.expert.user.language || 'en';
          getLegalDocLinks(expertLanguage).then(({ policyUrl }) => {
            sendNewBookingNotificationEmail({
              to:              booking.expert.user.email,
              expertName:      booking.expert.user.name,
              parentName:      booking.parent.name,
              parentEmail:     booking.parent.email,
              serviceTitle:    booking.service.title,
              format:          booking.format,
              scheduledAt:     booking.scheduled_at,
              durationMinutes: booking.duration_minutes,
              location:        booking.format === 'IN_PERSON' ? (expertAddress || undefined) : undefined,
              amount:          booking.amount,
              currency:        booking.currency,
              timezone:        booking.expert.timezone,
              language:        expertLanguage,
              policyUrl,
            });
          }).catch((e) => console.error('[Email] Expert notification email failed:', e.message));
        }
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
        const latestRefund = charge.refunds?.data?.[0];
        await prisma.booking.updateMany({
          where: { stripe_payment_intent_id: charge.payment_intent },
          data: {
            status: 'REFUNDED',
            ...(latestRefund ? {
              stripe_refund_id: latestRefund.id,
              refund_status:    latestRefund.status,
              refund_amount:    latestRefund.amount / 100,
              refunded_at:      new Date(latestRefund.created * 1000),
            } : {}),
          },
        });
      }
      break;
    }

    // ── Refund status updated (succeeded / failed / pending / canceled) ───
    // Handles the case where a refund transitions asynchronously — most
    // critically when a bank rejects the refund and status becomes "failed".
    // "succeeded" is belt-and-suspenders alongside charge.refunded.
    case 'refund.updated': {
      const refund = event.data.object;
      console.log(`[Webhook] refund.updated — refund=${refund.id} status=${refund.status} pi=${refund.payment_intent}`);

      if (!refund.payment_intent) break;

      const booking = await prisma.booking.findFirst({
        where: { stripe_payment_intent_id: refund.payment_intent },
      });

      if (!booking) {
        console.warn(`[Webhook] refund.updated — no booking found for pi=${refund.payment_intent}`);
        break;
      }

      if (refund.status === 'succeeded') {
        // Only promote CANCELLED → REFUNDED; leave CONFIRMED (partial refund)
        // and already-REFUNDED bookings untouched — charge.refunded may have
        // already handled this transition.
        const data = {
          stripe_refund_id: refund.id,
          refund_status:    'succeeded',
          refund_amount:    refund.amount / 100,
          refunded_at:      new Date(refund.created * 1000),
        };
        if (booking.status === 'CANCELLED') {
          data.status = 'REFUNDED';
        }
        await prisma.booking.update({ where: { id: booking.id }, data });
        console.log(`[Webhook] refund.updated succeeded — booking=${booking.id} refund=${refund.id}`);

      } else if (refund.status === 'failed') {
        // Bank/card network rejected the refund — flag for admin, do not
        // change booking status (stays CANCELLED so admin can act).
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            refund_status:       'failed',
            internal_admin_note: `Refund ${refund.id} failed — reason: ${refund.failure_reason || 'unknown'}. Manual refund required.`,
          },
        });
        logAudit(
          booking.parent_id,
          'REFUND_FAILED',
          'BOOKING',
          booking.id,
          `Stripe refund ${refund.id} failed — reason: ${refund.failure_reason || 'unknown'}. Manual intervention required.`
        );
        console.error(`[Webhook] refund.updated FAILED — booking=${booking.id} refund=${refund.id} reason=${refund.failure_reason}`);

      } else {
        // pending / canceled — keep refund_status in sync for admin visibility
        await prisma.booking.update({
          where: { id: booking.id },
          data: { refund_status: refund.status },
        });
        console.log(`[Webhook] refund.updated ${refund.status} — booking=${booking.id} refund=${refund.id}`);
      }
      break;
    }

    // ── Dispute opened: freeze payout and flag for admin ─────────────────
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.log(`[Webhook] charge.dispute.created — dispute=${dispute.id} charge=${dispute.charge} reason=${dispute.reason}`);

      const booking = await prisma.booking.findFirst({
        where: { stripe_charge_id: dispute.charge },
      });

      if (!booking) {
        console.warn(`[Webhook] charge.dispute.created — no booking found for charge=${dispute.charge}`);
        break;
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          is_disputed:     true,
          dispute_reason:  dispute.reason,
          disputed_at:     new Date(dispute.created * 1000),
          transfer_status: 'skipped',
        },
      });

      logAudit(booking.parent_id, 'DISPUTE_OPENED', 'BOOKING', booking.id,
        `Dispute ${dispute.id} opened · reason: ${dispute.reason} · charge: ${dispute.charge}`);

      console.log(`[Webhook] Booking ${booking.id} frozen — is_disputed=true transfer_status=skipped`);
      break;
    }

    // ── Payout failed on expert's connected account ───────────────────────
    // Stripe delivers this on the connected account (event.account is set).
    // We find the expert, write an audit note and email the ops team immediately.
    case 'payout.failed': {
      const payout = event.data.object;
      const stripeAccountId = event.account; // connected account that owns the payout
      console.error(`[Webhook] payout.failed — payout=${payout.id} account=${stripeAccountId} reason=${payout.failure_message}`);

      // Find the expert so we can name them in the alert
      const expert = stripeAccountId
        ? await prisma.expert.findFirst({
            where: { stripe_account_id: stripeAccountId },
            include: { user: { select: { name: true, email: true } } },
          })
        : null;

      // Find any booking linked to this payout so admin can act on it
      const affectedBooking = await prisma.booking.findFirst({
        where: { stripe_payout_id: payout.id },
      });

      if (affectedBooking) {
        await prisma.booking.update({
          where: { id: affectedBooking.id },
          data: {
            transfer_status:     'failed',
            internal_admin_note: `Payout ${payout.id} failed — ${payout.failure_message || 'unknown reason'}. Manual intervention required.`,
          },
        });
        logAudit(
          null, 'PAYOUT_FAILED', 'BOOKING', affectedBooking.id,
          `Stripe payout ${payout.id} failed on account ${stripeAccountId} — ${payout.failure_message || 'unknown'}`
        );
      }

      sendAdminPayoutAlert({
        subject: `Payout failed — ${expert?.user?.name || stripeAccountId}`,
        body: `A bank payout from expert ${expert?.user?.name || '(unknown)'} has failed. Stripe will automatically retry, but if the account balance is negative you will need to intervene manually.${payout.failure_message ? ` Failure reason: "${payout.failure_message}".` : ''}`,
        stripeAccountId,
        expertName: expert?.user?.name,
        bookingId:  affectedBooking?.id,
      }).catch((e) => console.error('[Email] Admin payout alert failed:', e.message));

      break;
    }

    // ── Account updated (expert onboarding / capability changes) ──────────
    case 'account.updated': {
      const account = event.data.object;
      const cardPaymentsActive = account.capabilities?.card_payments === 'active';
      console.log(`[Webhook] account.updated: ${account.id}, details_submitted=${account.details_submitted}, card_payments=${account.capabilities?.card_payments}`);

      await prisma.expert.updateMany({
        where: { stripe_account_id: account.id },
        data:  { stripe_onboarding_complete: account.details_submitted === true && cardPaymentsActive },
      });

      // Alert admin if the account has been disabled or has past-due requirements
      // that could block future payouts (e.g. after a chargeback that goes unresolved).
      const disabledReason = account.requirements?.disabled_reason;
      const pastDue = account.requirements?.past_due ?? [];
      if (disabledReason || pastDue.length > 0) {
        const expert = await prisma.expert.findFirst({
          where:   { stripe_account_id: account.id },
          include: { user: { select: { name: true } } },
        });
        sendAdminPayoutAlert({
          subject:        `Connected account restricted — ${expert?.user?.name || account.id}`,
          body:           `Expert Stripe account ${account.id} has been restricted by Stripe.${disabledReason ? ` Disabled reason: "${disabledReason}".` : ''} ${pastDue.length > 0 ? `Past-due requirements: ${pastDue.join(', ')}.` : ''} Payouts will be blocked until resolved.`,
          stripeAccountId: account.id,
          expertName:      expert?.user?.name,
        }).catch((e) => console.error('[Email] Admin account restriction alert failed:', e.message));
      }
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
}

// ─── Webhook: single source of truth for all payment outcomes ────────────────
//
// Called from stripe.webhook.routes.js which already applies express.raw().
// Two-phase idempotency:
//   1. Write StripeEvent row (processed=false) before processing — dedup guard
//      ensures duplicate deliveries are no-ops without entering processStripeEvent.
//   2. Mark processed=true only after processStripeEvent completes cleanly.
//      Rows stuck at processed=false are picked up by retryFailedWebhooks job.
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
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[Webhook] Signature verified — event type: ${event.type} id: ${event.id}`);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ── Phase 1: dedup guard — write before processing ──────────────────────────
  try {
    await prisma.stripeEvent.create({ data: { stripe_event_id: event.id, processed: false } });
  } catch (err) {
    if (err.code === 'P2002') {
      console.log(`[Webhook] Duplicate event skipped: ${event.id}`);
      return res.json({ received: true, duplicate: true });
    }
    console.error('[Webhook] DB error recording event:', err);
    return res.status(500).json({ error: 'Server error' });
  }

  // ── Phase 2: process, then mark as done ─────────────────────────────────────
  console.log(`[Webhook] Processing event: ${event.type} (${event.id})`);
  try {
    await processStripeEvent(event);
    await prisma.stripeEvent.update({
      where: { stripe_event_id: event.id },
      data:  { processed: true },
    });
  } catch (err) {
    // Processing failed — event stays processed=false so the retry job can pick
    // it up. Still return 200: Stripe must not redeliver (the dedup row exists).
    console.error(`[Webhook] Error processing ${event.type} (${event.id}):`, err);
  }

  return res.json({ received: true });
}

module.exports = { createConnectLink, handleStripeReturn, handleWebhook, processStripeEvent };
