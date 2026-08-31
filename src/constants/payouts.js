// ─── Payout settlement timing ────────────────────────────────────────────────
// Expert payouts are handled by Stripe: every connected account is put on an
// automatic daily payout schedule with a 7-day settlement delay when it is
// created (see stripe.controller.js → createConnectLink).
//
// This is how long after a session ends we assume that automatic payout has
// almost certainly reached the expert's bank. Once past this point a booking's
// transfer_status is flipped 'pending' → 'completed' (by markPayoutsSettled.js),
// which the refund/cancellation code reads to decide whether the expert's share
// can still be pulled back:
//   • transfer_status !== 'completed' → reverse the transfer (funds still sat
//     in the expert's Stripe balance)
//   • transfer_status === 'completed' → funds have left to their bank, refunds
//     need the platform-funded fallback / manual recovery
//
// 7 days is Stripe's delay_days; the extra buffer covers the pending→available
// period on the underlying charge plus the gap until the next daily payout run.
const PAYOUT_SETTLEMENT_DAYS = 9;
const PAYOUT_SETTLEMENT_MS = PAYOUT_SETTLEMENT_DAYS * 24 * 60 * 60 * 1000;

module.exports = { PAYOUT_SETTLEMENT_DAYS, PAYOUT_SETTLEMENT_MS };
