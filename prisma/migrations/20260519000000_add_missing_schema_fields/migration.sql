-- Capture schema fields that were applied via db push and never migrated.
-- All statements are idempotent (IF NOT EXISTS / ADD VALUE IF NOT EXISTS).

-- ── ExpertStatus: add CHANGES_REQUESTED value ────────────────────────────────
ALTER TYPE "ExpertStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

-- ── Expert: profile visibility and admin change-request fields ───────────────
ALTER TABLE "Expert"
  ADD COLUMN IF NOT EXISTS "is_published"        BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "change_request_note" TEXT,
  ADD COLUMN IF NOT EXISTS "change_requested_at" TIMESTAMP(3);

-- ── Expert: scheduling configuration ─────────────────────────────────────────
ALTER TABLE "Expert"
  ADD COLUMN IF NOT EXISTS "advance_booking_days" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "buffer_minutes"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "min_notice_hours"      INTEGER NOT NULL DEFAULT 24;

-- ── Expert: per-expert email notification preferences ────────────────────────
ALTER TABLE "Expert"
  ADD COLUMN IF NOT EXISTS "notify_cancellation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_new_booking"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_reminder"     BOOLEAN NOT NULL DEFAULT true;

-- ── Service: display sort order ──────────────────────────────────────────────
ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- ── AdminAuditLog: platform-wide audit trail ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id"          SERIAL        PRIMARY KEY,
  "admin_id"    INTEGER       NOT NULL,
  "action"      TEXT          NOT NULL,
  "entity_type" TEXT          NOT NULL,
  "entity_id"   INTEGER       NOT NULL,
  "note"        TEXT,
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
