const cron = require('node-cron');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');

// Bookings that have been PENDING_PAYMENT for longer than this are abandoned
const PENDING_TTL_MINUTES = 30;

// ─── Core cleanup logic (exported for testability) ────────────────────────────
async function runCleanup() {
  const cutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60 * 1000);

  const stale = await prisma.booking.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      created_at: { lt: cutoff },
    },
    select: {
      id: true,
      stripe_payment_intent_id: true,
    },
  });

  if (stale.length === 0) {
    return;
  }

  console.log(`[Cleanup] Found ${stale.length} stale PENDING_PAYMENT booking(s) — cancelling`);

  for (const booking of stale) {
    // ── Step 1: Cancel the Stripe PI first ───────────────────────────────────
    // IMPORTANT: cancel PI before deleting the DB record.
    // If the PI is already succeeded (payment landed just before the cron ran),
    // we must NOT delete the booking — the webhook owns it and will confirm it.
    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        // PI successfully canceled — safe to proceed with deletion
      } catch (stripeErr) {
        if (stripeErr.type === 'StripeInvalidRequestError') {
          // PI is in a non-cancelable state (succeeded, processing, etc.)
          // The payment_intent.succeeded webhook will confirm this booking.
          // Skip deletion to avoid deleting a booking that was just paid for.
          console.log(
            `[Cleanup] Booking ${booking.id}: PI ${booking.stripe_payment_intent_id}` +
            ` cannot be canceled (${stripeErr.message}) — leaving for webhook`
          );
          continue;
        }
        // Any other Stripe error — log it but still proceed with deletion
        // (the PI likely doesn't exist or is already canceled on Stripe's side)
        console.warn(
          `[Cleanup] Stripe error for booking ${booking.id}:`, stripeErr.message
        );
      }
    }

    // ── Step 2: Delete the booking with status guard ──────────────────────────
    // The status: 'PENDING_PAYMENT' guard is a final safety check — if the
    // webhook already confirmed this booking between Step 1 and Step 2,
    // deleteMany will match 0 records and do nothing.
    try {
      const result = await prisma.booking.deleteMany({
        where: { id: booking.id, status: 'PENDING_PAYMENT' },
      });
      if (result.count > 0) {
        console.log(`[Cleanup] Booking ${booking.id} deleted — slot freed`);
      } else {
        console.log(`[Cleanup] Booking ${booking.id} status changed before deletion — skipped`);
      }
    } catch (dbErr) {
      console.error(`[Cleanup] Failed to delete booking ${booking.id}:`, dbErr.message);
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startCleanupJob() {
  // Runs every 5 minutes: '*/5 * * * *'
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runCleanup();
    } catch (err) {
      // Top-level guard — should never reach here, but prevents the cron from dying
      console.error('[Cleanup] Unexpected error during cleanup run:', err);
    }
  });

  console.log(
    `[Cleanup] Stale booking cleanup scheduled` +
    ` (runs every 5 min, TTL = ${PENDING_TTL_MINUTES} min)`
  );
}

module.exports = { startCleanupJob, runCleanup };
