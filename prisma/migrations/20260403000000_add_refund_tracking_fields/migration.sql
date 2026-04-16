-- AlterTable: add refund tracking fields to Booking (idempotent)
ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "stripe_refund_id" TEXT,
  ADD COLUMN IF NOT EXISTS "refund_status"    TEXT,
  ADD COLUMN IF NOT EXISTS "refund_amount"    DECIMAL(10,2);
