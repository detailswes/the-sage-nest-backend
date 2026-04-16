/*
  Idempotent rewrite — objects were already created by prisma db push.
  COMMIT/BEGIN removed: not needed on PostgreSQL 14+ and it breaks
  Prisma's own transaction used to record migration results.
*/

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "EntityType" AS ENUM ('INDIVIDUAL', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'APPLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_RESCHEDULED',
    'PAYMENT_RECEIVED', 'PAYMENT_REFUNDED', 'BOOKING_REMINDER',
    'EXPERT_APPROVED', 'EXPERT_REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum: ADD VALUE IF NOT EXISTS is safe to run multiple times
-- No COMMIT/BEGIN needed on PostgreSQL 12+ (Render runs 14+)
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- AlterTable Booking
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "amount"                   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "cancellation_reason"      TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "platform_fee"             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "reminder_1h_sent"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reminder_24h_sent"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rescheduled_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rescheduled_from_id"      INTEGER,
  ADD COLUMN IF NOT EXISTS "stripe_charge_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_transfer_id"       TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_attempts"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "transfer_due_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transfer_status"          TEXT;

ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- AlterTable Expert
ALTER TABLE "Expert"
  ADD COLUMN IF NOT EXISTS "facebook"                   TEXT,
  ADD COLUMN IF NOT EXISTS "instagram"                  TEXT,
  ADD COLUMN IF NOT EXISTS "linkedin"                   TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "account_deleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "locked_until"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "login_attempts"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "phone"           TEXT;

-- DROP NOT NULL is a no-op if column is already nullable (PostgreSQL 11+)
ALTER TABLE "User" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable (IF NOT EXISTS = no-op if already present)
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id"          SERIAL NOT NULL,
    "user_id"     INTEGER NOT NULL,
    "provider"    "OAuthProvider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BusinessInfo" (
    "id"                 SERIAL NOT NULL,
    "expert_id"          INTEGER NOT NULL,
    "entity_type"        "EntityType" NOT NULL,
    "legal_name"         TEXT NOT NULL,
    "date_of_birth"      TIMESTAMP(3),
    "primary_address"    TEXT NOT NULL,
    "tin"                TEXT NOT NULL,
    "vat_number"         TEXT,
    "company_reg_number" TEXT,
    "iban"               TEXT NOT NULL,
    "business_email"     TEXT NOT NULL,
    "website"            TEXT NOT NULL,
    "municipality"       TEXT,
    "business_address"   TEXT,
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessInfo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LegalDocument" (
    "id"             SERIAL NOT NULL,
    "type"           TEXT NOT NULL,
    "version"        TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PrivacyPolicyAcceptance" (
    "id"                    SERIAL NOT NULL,
    "user_id"               INTEGER NOT NULL,
    "version"               TEXT NOT NULL,
    "accepted_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketing_consent"     BOOLEAN NOT NULL DEFAULT false,
    "marketing_accepted_at" TIMESTAMP(3),
    CONSTRAINT "PrivacyPolicyAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TcAcceptance" (
    "id"          SERIAL NOT NULL,
    "user_id"     INTEGER NOT NULL,
    "booking_id"  INTEGER NOT NULL,
    "version"     TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TcAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StripeEvent" (
    "id"              SERIAL NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "processed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SavedExpert" (
    "id"        SERIAL NOT NULL,
    "parent_id" INTEGER NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "saved_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedExpert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Review" (
    "id"         SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "parent_id"  INTEGER NOT NULL,
    "expert_id"  INTEGER NOT NULL,
    "rating"     INTEGER NOT NULL,
    "comment"    TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id"         SERIAL NOT NULL,
    "user_id"    INTEGER NOT NULL,
    "type"       "NotificationType" NOT NULL,
    "title"      TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "is_read"    BOOLEAN NOT NULL DEFAULT false,
    "booking_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS = no-op if already present)
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_provider_id_key"  ON "OAuthAccount"("provider", "provider_id");
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessInfo_expert_id_key"              ON "BusinessInfo"("expert_id");
CREATE UNIQUE INDEX IF NOT EXISTS "LegalDocument_type_version_key"          ON "LegalDocument"("type", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "TcAcceptance_booking_id_key"             ON "TcAcceptance"("booking_id");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeEvent_stripe_event_id_key"         ON "StripeEvent"("stripe_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "SavedExpert_parent_id_expert_id_key"     ON "SavedExpert"("parent_id", "expert_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Review_booking_id_key"                   ON "Review"("booking_id");
CREATE INDEX        IF NOT EXISTS "Review_expert_id_idx"                    ON "Review"("expert_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_expert_id_scheduled_at_key"      ON "Booking"("expert_id", "scheduled_at");

-- AddForeignKey (DO blocks catch duplicate_object if constraint already exists)
DO $$ BEGIN
  ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BusinessInfo" ADD CONSTRAINT "BusinessInfo_expert_id_fkey"
    FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_rescheduled_from_id_fkey"
    FOREIGN KEY ("rescheduled_from_id") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PrivacyPolicyAcceptance" ADD CONSTRAINT "PrivacyPolicyAcceptance_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TcAcceptance" ADD CONSTRAINT "TcAcceptance_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TcAcceptance" ADD CONSTRAINT "TcAcceptance_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedExpert" ADD CONSTRAINT "SavedExpert_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SavedExpert" ADD CONSTRAINT "SavedExpert_expert_id_fkey"
    FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_expert_id_fkey"
    FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
