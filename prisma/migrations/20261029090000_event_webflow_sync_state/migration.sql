-- Event → Webflow sync state: last spots-left value pushed (so the sync job
-- only touches events whose availability changed) and the archive timestamp
-- (cancelled / past events are archived, not deleted, so content can be reused).
ALTER TABLE "Service"
  ADD COLUMN "webflow_spots_left" INTEGER,
  ADD COLUMN "webflow_archived_at" TIMESTAMP(3);
