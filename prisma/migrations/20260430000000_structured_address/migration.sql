-- Replace free-text primary_address with structured address fields on BusinessInfo.
-- Existing rows: primary_address content is copied into address_street as a fallback;
-- other new columns get empty-string defaults so NOT NULL is satisfied immediately,
-- then the DEFAULT is dropped so the columns stay required going forward.

-- Step 1: add new columns as nullable so the ALTER doesn't fail on existing rows
ALTER TABLE "BusinessInfo"
  ADD COLUMN IF NOT EXISTS "address_street"      TEXT,
  ADD COLUMN IF NOT EXISTS "address_city"        TEXT,
  ADD COLUMN IF NOT EXISTS "address_postal_code" TEXT,
  ADD COLUMN IF NOT EXISTS "address_country"     TEXT;

-- Step 2: backfill — copy old free-text into street; leave city/postal/country as empty string
UPDATE "BusinessInfo"
SET
  "address_street"      = COALESCE("primary_address", ''),
  "address_city"        = '',
  "address_postal_code" = '',
  "address_country"     = ''
WHERE "address_street" IS NULL;

-- Step 3: enforce NOT NULL now that every row has a value
ALTER TABLE "BusinessInfo"
  ALTER COLUMN "address_street"      SET NOT NULL,
  ALTER COLUMN "address_city"        SET NOT NULL,
  ALTER COLUMN "address_postal_code" SET NOT NULL,
  ALTER COLUMN "address_country"     SET NOT NULL;

-- Step 4: drop the old column
ALTER TABLE "BusinessInfo"
  DROP COLUMN IF EXISTS "primary_address";
