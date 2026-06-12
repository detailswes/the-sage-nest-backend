-- Add marketing_consent_text: stores the exact opt-in statement shown to the user
-- Required for GDPR Art. 7(1) and Danish Markedsføringslov demonstrability.
ALTER TABLE "PrivacyPolicyAcceptance"
  ADD COLUMN IF NOT EXISTS "marketing_consent_text" TEXT,
  ADD COLUMN IF NOT EXISTS "marketing_withdrawn_at" TIMESTAMP(3);
