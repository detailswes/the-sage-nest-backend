-- AlterEnum
-- New qualification categories requested for the Italian expert profession
-- list (Dietista, Pedagogista) — no existing enum value covers either.
ALTER TYPE "QualificationType" ADD VALUE 'DIETITIAN';
ALTER TYPE "QualificationType" ADD VALUE 'PEDAGOGIST';
