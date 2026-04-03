const cron = require('node-cron');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');

// After this many consecutive Stripe failures the transfer is marked 'failed'
// and removed from the cron queue so it does not retry forever.
const MAX_ATTEMPTS = 5;

// ─── Core transfer logic (exported for testability) ───────────────────────────
async function runTransfers() {
  const now = new Date();

  // Find bookings whose transfer window has opened and are still pending.
  // We also require status=CONFIRMED as a hard safety guard — cancelled/refunded
  // bookings have transfer_status='skipped' but this double-check prevents any
  // edge-case race between a late cancellation and the cron firing.
  const due = await prisma.booking.findMany({
    where: {
      transfer_status: 'pending',
      transfer_due_at: { lte: now },
      status:          'CONFIRMED',
      transfer_attempts: { lt: MAX_ATTEMPTS },
      is_disputed:     false,
    },
    include: {
      expert: { select: { stripe_account_id: true } },
    },
  });

  if (due.length === 0) return;

  console.log(`[Transfers] ${due.length} transfer(s) due — processing`);

  for (const booking of due) {
    const expertStripeId = booking.expert?.stripe_account_id;

    // ── Safety checks before touching Stripe ──────────────────────────────
    if (!expertStripeId) {
      console.error(
        `[Transfers] Booking ${booking.id}: expert has no Stripe account — marking failed`
      );
      await prisma.booking.update({
        where: { id: booking.id },
        data: { transfer_status: 'failed', transfer_attempts: { increment: 1 } },
      });
      continue;
    }

    if (!booking.stripe_charge_id) {
      console.error(
        `[Transfers] Booking ${booking.id}: missing stripe_charge_id — marking failed`
      );
      await prisma.booking.update({
        where: { id: booking.id },
        data: { transfer_status: 'failed', transfer_attempts: { increment: 1 } },
      });
      continue;
    }

    if (!booking.amount || !booking.platform_fee) {
      console.error(
        `[Transfers] Booking ${booking.id}: missing amount or platform_fee — marking failed`
      );
      await prisma.booking.update({
        where: { id: booking.id },
        data: { transfer_status: 'failed', transfer_attempts: { increment: 1 } },
      });
      continue;
    }

    // ── Calculate expert payout (total minus platform fee) ─────────────────
    const expertAmountPence = Math.round(
      (Number(booking.amount) - Number(booking.platform_fee)) * 100
    );

    if (expertAmountPence <= 0) {
      console.error(
        `[Transfers] Booking ${booking.id}: calculated payout is ${expertAmountPence}p — marking failed`
      );
      await prisma.booking.update({
        where: { id: booking.id },
        data: { transfer_status: 'failed', transfer_attempts: { increment: 1 } },
      });
      continue;
    }

    // ── Create the Stripe transfer ──────────────────────────────────────────
    try {
      const transfer = await stripe.transfers.create({
        amount:             expertAmountPence,
        currency:           'gbp',
        destination:        expertStripeId,
        transfer_group:     String(booking.id),
        source_transaction: booking.stripe_charge_id,
        description:        `Payout for booking #${booking.id}`,
      });

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          transfer_status:   'completed',
          stripe_transfer_id: transfer.id,
          transfer_attempts: { increment: 1 },
        },
      });

      console.log(
        `[Transfers] Booking ${booking.id} → transfer ${transfer.id} ` +
        `(${expertAmountPence}p to ${expertStripeId}) ✓`
      );

    } catch (stripeErr) {
      const newAttempts = booking.transfer_attempts + 1;
      const giveUp      = newAttempts >= MAX_ATTEMPTS;

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          transfer_status:   giveUp ? 'failed' : 'pending',
          transfer_attempts: { increment: 1 },
        },
      });

      console.error(
        `[Transfers] Booking ${booking.id} — Stripe error (attempt ${newAttempts}/${MAX_ATTEMPTS}):`,
        stripeErr.message
      );

      if (giveUp) {
        console.error(
          `[Transfers] Booking ${booking.id} — max attempts reached, marked FAILED. ` +
          `Manual intervention required.`
        );
      }
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startTransferJob() {
  // Runs every 5 minutes — same cadence as cleanupPendingBookings
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runTransfers();
    } catch (err) {
      // Top-level guard — prevents the cron from dying on unexpected errors
      console.error('[Transfers] Unexpected error during transfer run:', err);
    }
  });

  console.log('[Transfers] Delayed transfer job scheduled (runs every 5 min)');
}

module.exports = { startTransferJob, runTransfers };
