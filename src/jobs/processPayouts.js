const cron = require('node-cron');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { sendAdminPayoutAlert } = require('../utils/email');

// ─── Expert payout release ───────────────────────────────────────────────────
// Parents pay via destination charges, so the expert's share lands in her Stripe
// balance at payment time. Her account is on MANUAL payouts, so it stays there
// until this job releases it to her bank — never before the session has ended.
//
// A booking is eligible once transfer_due_at (session end + PAYOUT_HOLD) has
// passed. New charges sit as "pending" in Stripe for a few days, and Stripe
// rejects a payout larger than the *available* balance. So the job checks the
// available balance first and, if the money isn't there yet, simply leaves the
// booking 'pending' and tries again on the next run — however long that takes.
// Only genuine Stripe errors count towards MAX_ERRORS.
const MAX_ERRORS = 10;

let running = false;

function availableFor(balance, currency) {
  return (balance.available || [])
    .filter((b) => b.currency === currency)
    .reduce((sum, b) => sum + b.amount, 0);
}

async function markFailed(booking, expertStripeId, reason) {
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      transfer_status:     'failed',
      transfer_attempts:   { increment: 1 },
      internal_admin_note: `Payout failed — ${reason}. Manual intervention required.`,
    },
  });
  sendAdminPayoutAlert({
    subject:         `Payout failed — Booking #${booking.id}`,
    body:            `The automated payout for booking #${booking.id} could not be created: "${reason}". Please check the expert's connected account (bank details, restrictions, balance) in the Stripe dashboard and either fix it and use "Retry transfer" in the admin panel, or pay out manually.`,
    stripeAccountId: expertStripeId,
    bookingId:       booking.id,
  }).catch((e) => console.error('[Email] Admin payout-failed alert failed:', e.message));
}

async function runPayouts() {
  const due = await prisma.booking.findMany({
    where: {
      transfer_status: 'pending',
      transfer_due_at: { lte: new Date() },
      status:          { in: ['CONFIRMED', 'COMPLETED'] },
      is_disputed:     false,
    },
    include: { expert: { select: { stripe_account_id: true } } },
    orderBy: { transfer_due_at: 'asc' },
  });

  if (due.length === 0) return;
  console.log(`[Payouts] ${due.length} booking(s) eligible — processing`);

  // One balance lookup per expert account per run; decremented locally as we
  // pay out so several bookings of one expert don't overdraw the same funds.
  const balances = new Map();

  for (const booking of due) {
    const expertStripeId = booking.expert?.stripe_account_id;

    if (!expertStripeId || !booking.stripe_charge_id || !booking.amount || booking.platform_fee == null) {
      console.error(`[Payouts] Booking ${booking.id}: missing Stripe account, charge or amounts — marking failed`);
      await markFailed(booking, expertStripeId, 'booking is missing its Stripe account, charge id or amounts');
      continue;
    }

    const expertAmountPence = Math.round((Number(booking.amount) - Number(booking.platform_fee)) * 100);
    if (expertAmountPence <= 0) {
      console.error(`[Payouts] Booking ${booking.id}: calculated payout is ${expertAmountPence}p — marking failed`);
      await markFailed(booking, expertStripeId, `calculated payout is ${expertAmountPence}p`);
      continue;
    }

    const currency = (booking.currency || 'EUR').toLowerCase();

    try {
      // ── Is the money available yet? ─────────────────────────────────────
      if (!balances.has(expertStripeId)) {
        balances.set(expertStripeId, await stripe.balance.retrieve({ stripeAccount: expertStripeId }));
      }
      const balance = balances.get(expertStripeId);
      if (availableFor(balance, currency) < expertAmountPence) {
        // Still pending in Stripe (or being paid out for another booking) —
        // not an error, just try again next run.
        continue;
      }

      // The booking may have been cancelled/refunded since the list was read.
      const fresh = await prisma.booking.findUnique({
        where:  { id: booking.id },
        select: { transfer_status: true, status: true, is_disputed: true },
      });
      if (fresh?.transfer_status !== 'pending' || fresh.is_disputed || !['CONFIRMED', 'COMPLETED'].includes(fresh.status)) {
        continue;
      }

      // Idempotency key: if the DB write below fails after Stripe accepted the
      // payout, the next run gets the same payout back instead of a second one.
      const payout = await stripe.payouts.create(
        {
          amount:      expertAmountPence,
          currency,
          description: `Payout for booking #${booking.id}`,
          metadata:    { booking_id: String(booking.id) },
        },
        { stripeAccount: expertStripeId, idempotencyKey: `booking-payout-${booking.id}` },
      );

      balance.available = balance.available.map((b) =>
        b.currency === currency ? { ...b, amount: b.amount - expertAmountPence } : b);

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          transfer_status:   'completed',
          stripe_payout_id:  payout.id,
          transfer_attempts: { increment: 1 },
        },
      });

      console.log(`[Payouts] Booking ${booking.id} → payout ${payout.id} (${expertAmountPence}p ${currency} from ${expertStripeId} to bank) ✓`);
    } catch (stripeErr) {
      // Insufficient balance can still slip through (e.g. a refund landed
      // between the balance check and the payout) — treat as "not yet".
      if (stripeErr.code === 'balance_insufficient') {
        console.log(`[Payouts] Booking ${booking.id} — balance not available yet, will retry`);
        continue;
      }

      const attempts = booking.transfer_attempts + 1;
      console.error(`[Payouts] Booking ${booking.id} — Stripe error (${attempts}/${MAX_ERRORS}):`, stripeErr.message);

      if (attempts >= MAX_ERRORS) {
        await markFailed(booking, expertStripeId, stripeErr.message);
      } else {
        await prisma.booking.update({
          where: { id: booking.id },
          data:  { transfer_attempts: { increment: 1 } },
        });
      }
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startPayoutJob() {
  cron.schedule('*/15 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await runPayouts();
    } catch (err) {
      console.error('[Payouts] Unexpected error during payout run:', err);
    } finally {
      running = false;
    }
  });

  console.log('[Payouts] Expert payout job scheduled (runs every 15 min)');
}

module.exports = { startPayoutJob, runPayouts };
