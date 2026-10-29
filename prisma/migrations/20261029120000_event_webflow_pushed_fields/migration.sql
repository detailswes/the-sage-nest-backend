-- Snapshot of the event detail fields last pushed to Webflow (per locale), so syncs
-- only send fields that actually changed and never overwrite the client's CMS edits.
ALTER TABLE "Service" ADD COLUMN "webflow_pushed_fields" JSONB;
