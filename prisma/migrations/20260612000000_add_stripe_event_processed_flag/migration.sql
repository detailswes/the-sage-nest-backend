ALTER TABLE "StripeEvent" ADD COLUMN IF NOT EXISTS "processed" BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: every existing row was written after successful processing,
-- so they are all considered processed.
UPDATE "StripeEvent" SET "processed" = true WHERE "processed" = false;
