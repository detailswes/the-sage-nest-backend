-- AlterTable
-- IBAN is no longer collected in the expert business-info form — payout
-- details are already captured through Stripe Connect onboarding. Existing
-- values are left in place (untouched by this migration); only future rows
-- are no longer required to supply one.
ALTER TABLE "BusinessInfo" ALTER COLUMN "iban" DROP NOT NULL;
