-- Rename FOR_MUM → FOR_PARENTS in the ServiceCluster enum.
-- ALTER TYPE ... RENAME VALUE is safe in PostgreSQL 10+ and does not require
-- a data migration — it only changes the label, no rows are rewritten.
ALTER TYPE "ServiceCluster" RENAME VALUE 'FOR_MUM' TO 'FOR_PARENTS';

-- Add the new EVENT variant (IF NOT EXISTS guards against re-running).
ALTER TYPE "ServiceCluster" ADD VALUE IF NOT EXISTS 'EVENT';
