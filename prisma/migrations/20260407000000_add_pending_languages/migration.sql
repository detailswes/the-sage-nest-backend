-- AddColumn: pending_languages on Expert
ALTER TABLE "Expert" ADD COLUMN "pending_languages" TEXT[] NOT NULL DEFAULT '{}';
