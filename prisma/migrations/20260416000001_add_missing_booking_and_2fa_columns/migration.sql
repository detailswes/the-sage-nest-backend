-- Add Booking columns that exist in schema.prisma but were never migrated
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "is_reschedule"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_disputed"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dispute_reason"      TEXT,
  ADD COLUMN IF NOT EXISTS "disputed_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "internal_admin_note" TEXT;

-- Add User 2FA columns that exist in migration 20260409000000 but not in schema.prisma
-- (already in DB if that migration applied; IF NOT EXISTS makes this safe either way)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otp_hash"           TEXT,
  ADD COLUMN IF NOT EXISTS "otp_expires_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "otp_attempts"       INTEGER NOT NULL DEFAULT 0;
