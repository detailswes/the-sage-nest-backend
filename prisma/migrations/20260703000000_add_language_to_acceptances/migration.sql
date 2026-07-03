-- AlterTable
ALTER TABLE "PrivacyPolicyAcceptance" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "TcAcceptance" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
