-- AlterEnum
-- ADD VALUE cannot run in the same transaction as a statement that uses the
-- new value, so this migration only adds the value — nothing else.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CURRENCY_CHANGED';
