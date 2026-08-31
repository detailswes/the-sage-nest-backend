const cron = require('node-cron');
const prisma = require('../prisma/client');

// ─── Payout settlement marker ────────────────────────────────────────────────
// Expert payouts are handled entirely by Stripe now. Every connected account is
// on an automatic daily payout schedule with a 7-day settlement delay (set in
// stripe.controller.js → createConnectLink), so Stripe releases each expert's
// cleared balance to their bank on its own. This job moves NO money.
//
// Its only purpose is bookkeeping: once a booking's transfer_due_at has passed
// (session end + PAYOUT_SETTLEMENT_DAYS — by which point Stripe's payout has
// almost certainly landed), flip transfer_status 'pending' → 'completed'. The
// refund/cancellation code reads that flag to decide whether the expert's share
// can still be reversed out of their Stripe balance ('pending') or has already
// gone to their bank and needs manual handling ('completed').
//
// Cancelled/disputed bookings are set to 'skipped' elsewhere and are ignored
// here.
async function runPayoutSettlement() {
  const now = new Date();

  const result = await prisma.booking.updateMany({
    where: {
      transfer_status: 'pending',
      transfer_due_at: { lte: now },
      status:          { in: ['CONFIRMED', 'COMPLETED'] },
      is_disputed:     false,
    },
    data: { transfer_status: 'completed' },
  });

  if (result.count > 0) {
    console.log(`[PayoutSettlement] Marked ${result.count} booking(s) as settled`);
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startPayoutSettlementJob() {
  // Hourly is ample — this only advances a status flag, nothing is time-critical.
  cron.schedule('7 * * * *', async () => {
    try {
      await runPayoutSettlement();
    } catch (err) {
      console.error('[PayoutSettlement] Unexpected error during settlement run:', err);
    }
  });

  console.log('[PayoutSettlement] Payout settlement marker job scheduled (runs hourly)');
}

module.exports = { startPayoutSettlementJob, runPayoutSettlement };
