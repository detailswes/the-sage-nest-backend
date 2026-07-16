-- Adds the fields needed to make BookingConsent a complete, verbatim audit
-- record: the Cancellation Policy version referenced by the same checkbox as
-- the T&C, an explicit tc_accepted flag, and snapshots of the exact wording
-- (including the withdrawal expander text) shown at the moment of booking.
-- Safe to run whether or not the BookingConsent-creating migration has run
-- yet, and safe against any existing rows (DEFAULT supplied for the new
-- NOT NULL column).
ALTER TABLE "BookingConsent" ADD COLUMN IF NOT EXISTS "tc_accepted" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BookingConsent" ADD COLUMN IF NOT EXISTS "terms_wording_snapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BookingConsent" ADD COLUMN IF NOT EXISTS "cancellation_policy_version" TEXT;
ALTER TABLE "BookingConsent" ADD COLUMN IF NOT EXISTS "withdrawal_wording_snapshot" TEXT;
ALTER TABLE "BookingConsent" ADD COLUMN IF NOT EXISTS "withdrawal_expander_snapshot" TEXT;
