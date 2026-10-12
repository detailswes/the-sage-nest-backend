// ─── Payout hold timing ──────────────────────────────────────────────────────
// Parents pay via destination charges, so the expert's share lands in her Stripe
// balance at payment time. Every connected account is on MANUAL payouts (set in
// stripe.controller.js → createConnectLink), so nothing reaches her bank until
// jobs/processPayouts.js releases it.
//
// A booking becomes eligible for payout this long after its session ends. The
// job then waits until the money is actually *available* in her Stripe balance
// (new charges sit as "pending" for a few days) and pays it out the moment it is.
//
// transfer_status semantics (read by the refund/cancellation code):
//   • 'pending'   → funds still sit in the expert's Stripe balance, the refund
//                   can reverse the transfer out of that balance
//   • 'completed' → payout created, funds have left to her bank
const PAYOUT_HOLD_HOURS = 24;
const PAYOUT_HOLD_MS = PAYOUT_HOLD_HOURS * 60 * 60 * 1000;

module.exports = { PAYOUT_HOLD_HOURS, PAYOUT_HOLD_MS };
