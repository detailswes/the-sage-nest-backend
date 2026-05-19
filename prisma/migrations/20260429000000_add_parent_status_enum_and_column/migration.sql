-- ParentStatus enum and User.parent_status column.
-- These were applied via db push and never captured in a migration.
-- Must run BEFORE 20260430000001_remove_deactivated_parent_status, which
-- restructures this enum and assumes both the type and column already exist.
-- All three original values (ACTIVE, SUSPENDED, DEACTIVATED) are included so
-- the subsequent migration can safely drop DEACTIVATED.

DO $$ BEGIN
  CREATE TYPE "ParentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "parent_status" "ParentStatus";
