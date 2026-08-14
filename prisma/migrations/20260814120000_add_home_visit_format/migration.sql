-- AlterEnum
-- Third delivery mode: the expert travels to the parent's address. The address
-- itself is never stored — the expert arranges it with the parent directly,
-- mirroring how online session links are handled today.
--
-- Added to both enums: ServiceFormat drives Service.format / Booking.format,
-- while SessionFormat is the expert's profile-level capability (an expert who
-- offers home visits alongside another mode selects BOTH, which leaves the
-- per-service format free).
ALTER TYPE "ServiceFormat" ADD VALUE 'HOME_VISIT';
ALTER TYPE "SessionFormat" ADD VALUE 'HOME_VISIT';
