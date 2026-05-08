-- AlterTable
ALTER TABLE "Service" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR';
