-- Events often take place at a venue different from the expert's practice
-- address (a studio, a community space, etc.) — the expert enters it per
-- event. event_city is split out separately for Webflow's events listing
-- filter, which needs a plain city value rather than a free-text address.
ALTER TABLE "Service"
  ADD COLUMN "event_location" TEXT,
  ADD COLUMN "event_city" TEXT;

ALTER TABLE "service_drafts"
  ADD COLUMN "event_location" TEXT,
  ADD COLUMN "event_city" TEXT;
