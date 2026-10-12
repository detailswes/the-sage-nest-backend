-- In-person events reuse the expert's practice address, same as a normal
-- in-person service — no separate one-off venue field.
ALTER TABLE "Service" DROP COLUMN "event_location";
ALTER TABLE "service_drafts" DROP COLUMN "event_location";
