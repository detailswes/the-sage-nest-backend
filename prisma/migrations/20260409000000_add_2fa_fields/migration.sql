ALTER TABLE "User"
  ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "otp_hash"           TEXT,
  ADD COLUMN "otp_expires_at"     TIMESTAMP(3),
  ADD COLUMN "otp_attempts"       INTEGER NOT NULL DEFAULT 0;
