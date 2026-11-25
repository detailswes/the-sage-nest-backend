// Single source of truth for the refund tier a cancellation earns.
// Every code path that cancels a booking (parent cancel, admin cancel, parent
// suspension, admin manual-refund guidance) must use this — never re-inline
// the thresholds, or events and sessions drift apart again.
//
//   1:1 sessions:  >= 24 h before → 100%  ·  >= 12 h → 50%  ·  < 12 h → 0%
//   Events:        >= 7 days (168 h) before → 100%  ·  otherwise → 0% (binary)
//
// Boundaries are inclusive on the more favourable side (exactly 24 h / 7 days
// earns the higher tier). Expert-initiated cancellations always refund 100%
// and don't go through here. Free events have nothing to refund regardless.

const EVENT_FULL_REFUND_HOURS = 7 * 24;

function isEventService(service) {
  return service?.cluster === "EVENT";
}

/** @returns {0 | 50 | 100} */
function refundTierPercent({ isEvent, hoursUntil }) {
  if (isEvent) return hoursUntil >= EVENT_FULL_REFUND_HOURS ? 100 : 0;
  return hoursUntil >= 24 ? 100 : hoursUntil >= 12 ? 50 : 0;
}

/** Human label for admin screens / audit notes. */
function refundTierLabel({ isEvent, hoursUntil }) {
  if (isEvent) return hoursUntil >= EVENT_FULL_REFUND_HOURS ? "full refund (≥7 days)" : "no refund (<7 days)";
  return hoursUntil >= 24 ? "full refund (>24 h)" : hoursUntil >= 12 ? "50% refund (12–24 h)" : "no refund (<12 h)";
}

module.exports = { EVENT_FULL_REFUND_HOURS, isEventService, refundTierPercent, refundTierLabel };
