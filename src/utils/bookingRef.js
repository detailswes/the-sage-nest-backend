// Human-readable booking reference shown in emails and used by parents when
// filling in the model withdrawal form. No separate stored field exists (or
// is needed) — it's a formatted view of the booking's numeric id.
function formatBookingRef(bookingId) {
  return `#SN-${bookingId}`;
}

module.exports = { formatBookingRef };
