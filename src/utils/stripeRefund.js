const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Stripe error codes that mean the connected account has no usable balance.
// When these occur with reverse_transfer:true, we fall back to funding the
// refund from the platform balance and flag it for admin follow-up.
const ZERO_BALANCE_CODES = new Set([
  "insufficient_funds",
  "transfer_reversal_too_large",
  "account_invalid", // deauthorised / disconnected account
  "account_closed",
]);

// ─── createRefundWithFallback ─────────────────────────────────────────────────
// Issues a Stripe refund with an idempotency key.
// When reverse_transfer would be needed but fails due to zero/blocked balance,
// automatically retries without the reversal (platform absorbs the cost) and
// writes an admin note so the funds can be recovered manually.
//
// Returns { refund, platformFunded }
async function createRefundWithFallback({
  bookingId,
  chargeId,
  amountPence,
  idempotencyKey,
  shouldReverseTransfer,
}) {
  const baseParams = {
    charge: chargeId,
    refund_application_fee: true,
    ...(amountPence !== undefined ? { amount: amountPence } : {}),
  };

  try {
    const refund = await stripe.refunds.create(
      { ...baseParams, reverse_transfer: shouldReverseTransfer },
      { idempotencyKey },
    );
    return { refund, platformFunded: false };
  } catch (err) {
    // Only fall back when the transfer reversal is the specific failure point.
    // For any other Stripe error (card_error, API outage, etc.) re-throw so
    // the caller can handle it appropriately.
    if (shouldReverseTransfer && ZERO_BALANCE_CODES.has(err.code)) {
      console.warn(
        `[createRefundWithFallback] booking=${bookingId} reverse_transfer failed (${err.code}) — retrying without reversal (platform-funded)`,
      );
      // Use a distinct idempotency key so Stripe doesn't return the previous error
      const fallbackKey = `${idempotencyKey}-platform`;
      const refund = await stripe.refunds.create(
        { ...baseParams, reverse_transfer: false },
        { idempotencyKey: fallbackKey },
      );
      return { refund, platformFunded: true };
    }
    throw err;
  }
}

module.exports = { createRefundWithFallback, ZERO_BALANCE_CODES };
