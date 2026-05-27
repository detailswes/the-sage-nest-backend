-- Add per-parent email notification preference flags.
-- All default to true except platform_updates which defaults to false.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notify_booking_confirmation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_expert_cancellation"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_platform_updates"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notify_reschedule"           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_session_reminder"     BOOLEAN NOT NULL DEFAULT true;
