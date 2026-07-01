-- pragma: noTransaction
-- AlterEnum: ADD VALUE IF NOT EXISTS is idempotent and safe to replay
ALTER TYPE "ServiceCluster" ADD VALUE IF NOT EXISTS 'FOR_FAMILY';
