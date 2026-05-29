-- Add Webflow CMS sync tracking fields to Expert and Service models.
-- Idempotent — safe to run even if db push already applied these changes.

-- ── WebflowSyncStatus enum ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WebflowSyncStatus" AS ENUM ('UNSYNCED', 'SYNCED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Expert: Webflow sync tracking ─────────────────────────────────────────────
ALTER TABLE "Expert"
  ADD COLUMN IF NOT EXISTS "webflow_item_id"    TEXT,
  ADD COLUMN IF NOT EXISTS "webflow_slug"        TEXT,
  ADD COLUMN IF NOT EXISTS "webflow_sync_status" "WebflowSyncStatus" NOT NULL DEFAULT 'UNSYNCED',
  ADD COLUMN IF NOT EXISTS "webflow_synced_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "webflow_sync_error"  TEXT;

-- ── Service: Webflow sync tracking ────────────────────────────────────────────
ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "webflow_item_id"    TEXT,
  ADD COLUMN IF NOT EXISTS "webflow_slug"        TEXT,
  ADD COLUMN IF NOT EXISTS "webflow_sync_status" "WebflowSyncStatus" NOT NULL DEFAULT 'UNSYNCED',
  ADD COLUMN IF NOT EXISTS "webflow_synced_at"   TIMESTAMP(3);
