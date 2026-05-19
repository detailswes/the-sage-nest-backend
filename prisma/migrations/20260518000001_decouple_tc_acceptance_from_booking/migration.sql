-- Decouple TcAcceptance from Booking.
-- Previously one record per booking (deleted on booking abandon via cascade).
-- Now one record per (user, version) — persists independently of any booking.

-- Drop the foreign key and unique constraint on booking_id
ALTER TABLE "TcAcceptance" DROP CONSTRAINT IF EXISTS "TcAcceptance_booking_id_fkey";
ALTER TABLE "TcAcceptance" DROP CONSTRAINT IF EXISTS "TcAcceptance_booking_id_key";

-- Remove the booking_id column
ALTER TABLE "TcAcceptance" DROP COLUMN IF EXISTS "booking_id";

-- Deduplicate before adding unique constraint (safety: keep earliest record per user+version)
DELETE FROM "TcAcceptance"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "TcAcceptance"
  GROUP BY user_id, version
);

-- Add compound unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "TcAcceptance_user_id_version_key"
  ON "TcAcceptance"(user_id, version);
