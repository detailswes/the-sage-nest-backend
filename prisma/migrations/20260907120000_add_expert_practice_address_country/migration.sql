-- AlterTable
-- Practice-address country for the Expert profile (and its pending-review
-- draft). Nullable at the column level so existing rows are not rejected;
-- the application layer requires it on every profile save going forward.
-- IF NOT EXISTS so this migration can be re-run after a partial apply.
ALTER TABLE "Expert" ADD COLUMN IF NOT EXISTS "address_country" TEXT;
ALTER TABLE "expert_profile_drafts" ADD COLUMN IF NOT EXISTS "address_country" TEXT;

-- Backfill every existing expert from their BusinessInfo country (a required
-- 1:1 record, so this covers all onboarded experts). Practice country and
-- registered/DAC7 country coincide for essentially every solo practitioner;
-- experts whose practice sits elsewhere can override it from the profile form.
UPDATE "Expert" e
SET "address_country" = LOWER(b."address_country")
FROM "BusinessInfo" b
WHERE b."expert_id" = e."id"
  AND e."address_country" IS NULL
  AND b."address_country" IS NOT NULL
  AND b."address_country" <> '';

-- Carry the same backfill into any open profile draft so an APPROVED expert
-- editing an unrelated field is not forced to re-enter it (and does not see a
-- spurious change that would reset the draft to PENDING_REVIEW).
UPDATE "expert_profile_drafts" d
SET "address_country" = e."address_country"
FROM "Expert" e
WHERE e."id" = d."expert_id"
  AND d."address_country" IS NULL
  AND e."address_country" IS NOT NULL;
