/*
  Warnings:

  - You are about to drop the column `is_approved` on the `Expert` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ExpertStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Expert" DROP COLUMN "is_approved",
ADD COLUMN     "status" "ExpertStatus" NOT NULL DEFAULT 'PENDING';
