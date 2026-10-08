ALTER TABLE "service_drafts"
  ADD COLUMN "event_starts_at" TIMESTAMP(3),
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "event_location" TEXT;
