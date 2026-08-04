-- AlterTable
-- billing_invoice_holder is nullable: existing bookings created before this
-- feature was collected have no value to backfill, and this table is not
-- empty in production. New bookings still always populate it at the
-- application layer (see booking.controller.js createBooking) — this is a
-- storage-level relaxation to tolerate pre-existing rows, not a change to
-- what's required going forward.
ALTER TABLE "BookingConsent"
  ADD COLUMN "billing_invoice_holder" TEXT,
  ADD COLUMN "billing_address" TEXT,
  ADD COLUMN "billing_postcode" TEXT,
  ADD COLUMN "billing_town" TEXT,
  ADD COLUMN "billing_province" TEXT,
  ADD COLUMN "billing_country" TEXT,
  ADD COLUMN "billing_fiscal_code" TEXT,
  ADD COLUMN "billing_no_fiscal_code" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "health_consent_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "health_consent_flow" TEXT,
  ADD COLUMN "health_consent_given" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "health_consent_accepted_at" TIMESTAMP(3),
  ADD COLUMN "health_consent_wording_snapshot" TEXT,
  ADD COLUMN "health_consent_helper_snapshot" TEXT,
  ADD COLUMN "health_consent_version" TEXT;
