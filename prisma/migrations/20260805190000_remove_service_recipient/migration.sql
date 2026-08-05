-- Consent flow (parent vs. baby) is now derived from the existing `cluster`
-- marketing tag (FOR_BABY vs. everything else) instead of a separate field.
ALTER TABLE "Service" DROP COLUMN "health_service_recipient";
DROP TYPE "ServiceRecipient";
