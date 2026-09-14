-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "ServiceReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
-- Default is APPROVED here (not PENDING_REVIEW) so every pre-existing Service
-- row is backfilled to APPROVED by this same statement — nothing currently
-- live/bookable should disappear from parent-facing queries the moment this
-- ships. A follow-up migration flips the default to PENDING_REVIEW for rows
-- created from here on, without touching what this backfill just set.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "review_status" "ServiceReviewStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "rejection_note" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "service_drafts" (
    "id"               SERIAL NOT NULL,
    "service_id"       INTEGER NOT NULL,
    "title"            TEXT,
    "description"      TEXT,
    "duration_minutes" INTEGER,
    "price"            DECIMAL(10,2),
    "format"           "ServiceFormat",
    "cluster"          "ServiceCluster",
    "home_visit_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"           "DraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submitted_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at"      TIMESTAMP(3),
    "rejection_note"   TEXT,
    CONSTRAINT "service_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "service_drafts_service_id_key" ON "service_drafts"("service_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "service_drafts" ADD CONSTRAINT "service_drafts_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
