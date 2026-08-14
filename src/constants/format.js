// Single source of truth for delivery formats. These were previously duplicated
// as literal arrays in service/expert/booking controllers, which is how a new
// mode can silently end up valid in one place and rejected in another.

// Per-service / per-booking format (Prisma enum ServiceFormat).
const SERVICE_FORMATS = ['ONLINE', 'IN_PERSON', 'HOME_VISIT'];

// Expert profile-level capability (Prisma enum SessionFormat). BOTH is the
// "no single format" option — it is the only value that leaves each service's
// format free rather than cascading down to every service.
const SESSION_FORMATS = [...SERVICE_FORMATS, 'BOTH'];

// True when an expert-level format should be pushed down onto every one of
// their services. Written as "anything except BOTH" so a future fourth mode
// cascades correctly without needing this predicate updated.
const cascadesToServices = (sessionFormat) =>
  Boolean(sessionFormat) && sessionFormat !== 'BOTH';

// Delivered at the parent's address, which the platform never stores — the
// expert arranges it with the parent directly using the contact details shared
// on the booking.
const isHomeVisit = (format) => format === 'HOME_VISIT';

// The expert's own address is only ever the session location for IN_PERSON.
// ONLINE has no location; HOME_VISIT happens at the parent's address.
const usesExpertAddress = (format) => format === 'IN_PERSON';

module.exports = {
  SERVICE_FORMATS,
  SESSION_FORMATS,
  cascadesToServices,
  isHomeVisit,
  usesExpertAddress,
};
