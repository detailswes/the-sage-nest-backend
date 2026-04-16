-- AddColumn: pending_languages on Expert (idempotent)
ALTER TABLE "Expert" ADD COLUMN IF NOT EXISTS "pending_languages" TEXT[] NOT NULL DEFAULT '{}';
