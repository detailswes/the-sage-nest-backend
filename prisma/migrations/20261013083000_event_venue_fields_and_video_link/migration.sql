-- Split the single free-text event_location field into structured venue
-- fields (venue name, address, postcode — event_city already existed
-- separately), matching the client's event email templates, which name
-- each part individually. Best-effort carry the old combined value into
-- event_address rather than silently dropping it.
ALTER TABLE "Service"
  ADD COLUMN "event_venue_name" TEXT,
  ADD COLUMN "event_address" TEXT,
  ADD COLUMN "event_postcode" TEXT;

UPDATE "Service" SET "event_address" = "event_location" WHERE "event_location" IS NOT NULL;

ALTER TABLE "Service" DROP COLUMN "event_location";

ALTER TABLE "service_drafts"
  ADD COLUMN "event_venue_name" TEXT,
  ADD COLUMN "event_address" TEXT,
  ADD COLUMN "event_postcode" TEXT;

UPDATE "service_drafts" SET "event_address" = "event_location" WHERE "event_location" IS NOT NULL;

ALTER TABLE "service_drafts" DROP COLUMN "event_location";

-- Video call link for online events — sent to parents only in the 24h event
-- reminder, never in the booking confirmation. video_link_alert_sent guards
-- the 36h missing-link alert job from re-notifying the expert every cycle.
ALTER TABLE "Service"
  ADD COLUMN "video_link" TEXT,
  ADD COLUMN "video_link_alert_sent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "service_drafts"
  ADD COLUMN "video_link" TEXT;
