-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "DraftStatus" AS ENUM ('PENDING_REVIEW', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "expert_profile_drafts" (
    "id"               SERIAL NOT NULL,
    "expert_id"        INTEGER NOT NULL,
    "bio"              TEXT,
    "summary"          TEXT,
    "position"         TEXT,
    "session_format"   "SessionFormat",
    "address_street"   TEXT,
    "address_city"     TEXT,
    "address_postcode" TEXT,
    "languages"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pending_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "timezone"         TEXT,
    "instagram"        TEXT,
    "facebook"         TEXT,
    "linkedin"         TEXT,
    "expertise"        TEXT,
    "status"           "DraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submitted_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at"      TIMESTAMP(3),
    "rejection_note"   TEXT,
    CONSTRAINT "expert_profile_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "expert_profile_drafts_expert_id_key" ON "expert_profile_drafts"("expert_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "expert_profile_drafts" ADD CONSTRAINT "expert_profile_drafts_expert_id_fkey"
    FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
