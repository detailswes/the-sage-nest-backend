-- Add T&C acceptance fields to PrivacyPolicyAcceptance so both consents are
-- recorded together at registration time with their document versions.
ALTER TABLE "PrivacyPolicyAcceptance"
  ADD COLUMN IF NOT EXISTS "tc_version"     TEXT,
  ADD COLUMN IF NOT EXISTS "tc_accepted_at" TIMESTAMP(3);
