-- Add optional city/location and timezone fields to User.
-- Timezone is auto-detected at registration and can be overridden in profile settings.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "city"     TEXT,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT;
