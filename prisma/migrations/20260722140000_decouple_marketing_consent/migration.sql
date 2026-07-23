-- CreateTable
CREATE TABLE "MarketingConsent" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_text" TEXT,
    "accepted_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingConsent_user_id_key" ON "MarketingConsent"("user_id");

-- AddForeignKey
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry each user's latest known marketing-consent state out of
-- PrivacyPolicyAcceptance (most recent row per user) into the new, decoupled
-- MarketingConsent table before the old columns are dropped below.
INSERT INTO "MarketingConsent" ("user_id", "consent", "consent_text", "accepted_at", "withdrawn_at", "source", "updated_at")
SELECT DISTINCT ON (ppa."user_id")
    ppa."user_id",
    ppa."marketing_consent",
    ppa."marketing_consent_text",
    ppa."marketing_accepted_at",
    ppa."marketing_withdrawn_at",
    'REGISTRATION',
    now()
FROM "PrivacyPolicyAcceptance" ppa
ORDER BY ppa."user_id", ppa."accepted_at" DESC;

-- AlterTable: drop the now-decoupled marketing fields from PrivacyPolicyAcceptance
ALTER TABLE "PrivacyPolicyAcceptance"
    DROP COLUMN "marketing_consent",
    DROP COLUMN "marketing_accepted_at",
    DROP COLUMN "marketing_consent_text",
    DROP COLUMN "marketing_withdrawn_at";
