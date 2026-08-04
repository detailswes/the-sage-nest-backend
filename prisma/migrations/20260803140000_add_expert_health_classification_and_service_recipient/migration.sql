-- CreateEnum
CREATE TYPE "ServiceRecipient" AS ENUM ('PARENTS', 'BABY');

-- AlterTable
ALTER TABLE "Expert" ADD COLUMN "is_health_professional" BOOLEAN;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "health_service_recipient" "ServiceRecipient";
