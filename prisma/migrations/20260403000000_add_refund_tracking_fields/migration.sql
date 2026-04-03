-- AlterTable: add refund tracking fields to Booking
ALTER TABLE "Booking"
ADD COLUMN "stripe_refund_id" TEXT,
ADD COLUMN "refund_status"    TEXT,
ADD COLUMN "refund_amount"    DECIMAL(10,2);
