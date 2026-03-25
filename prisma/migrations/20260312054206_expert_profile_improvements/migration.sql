-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('ONLINE', 'IN_PERSON', 'BOTH');

-- CreateEnum
CREATE TYPE "ServiceFormat" AS ENUM ('ONLINE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "ServiceCluster" AS ENUM ('FOR_MUM', 'FOR_BABY', 'PACKAGE', 'GIFT');

-- CreateEnum
CREATE TYPE "QualificationType" AS ENUM ('LACTATION_CONSULTANT', 'BREASTFEEDING_COUNSELLOR', 'INFANT_SLEEP_CONSULTANT', 'DOULA', 'MIDWIFE', 'BABY_OSTEOPATH', 'PAEDIATRIC_NUTRITIONIST', 'EARLY_YEARS_SPECIALIST', 'POSTNATAL_PHYSIOTHERAPIST', 'PARENTING_COACH', 'OTHER');

-- AlterTable
ALTER TABLE "Expert" ADD COLUMN     "address_city" TEXT,
ADD COLUMN     "address_postcode" TEXT,
ADD COLUMN     "address_street" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "position" TEXT,
ADD COLUMN     "session_format" "SessionFormat",
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "cluster" "ServiceCluster",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "format" "ServiceFormat";

-- CreateTable
CREATE TABLE "Qualification" (
    "id" SERIAL NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "type" "QualificationType" NOT NULL,
    "custom_name" TEXT,
    "document_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" SERIAL NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "document_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurance" (
    "id" SERIAL NOT NULL,
    "expert_id" INTEGER NOT NULL,
    "document_url" TEXT NOT NULL,
    "policy_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insurance_expert_id_key" ON "Insurance"("expert_id");

-- AddForeignKey
ALTER TABLE "Qualification" ADD CONSTRAINT "Qualification_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insurance" ADD CONSTRAINT "Insurance_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "Expert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
