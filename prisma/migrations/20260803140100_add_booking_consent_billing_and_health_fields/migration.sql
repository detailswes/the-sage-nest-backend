-- AlterTable
ALTER TABLE "BookingConsent"
  ADD COLUMN "billing_invoice_holder" TEXT NOT NULL,
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
