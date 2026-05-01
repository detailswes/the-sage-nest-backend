-- Consolidate DEACTIVATED into SUSPENDED on the ParentStatus enum.
-- Any parent that was deactivated (soft block) is promoted to suspended (hard block).

-- Step 1: migrate existing DEACTIVATED rows to SUSPENDED
UPDATE "User" SET "parent_status" = 'SUSPENDED' WHERE "parent_status" = 'DEACTIVATED';

-- Step 2: recreate the enum without DEACTIVATED
-- PostgreSQL doesn't support DROP VALUE, so we create a new type, swap, then clean up.
CREATE TYPE "ParentStatus_new" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "User"
  ALTER COLUMN "parent_status" TYPE "ParentStatus_new"
  USING "parent_status"::text::"ParentStatus_new";

DROP TYPE "ParentStatus";
ALTER TYPE "ParentStatus_new" RENAME TO "ParentStatus";
