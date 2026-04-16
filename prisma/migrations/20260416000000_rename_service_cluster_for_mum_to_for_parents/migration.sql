-- Rename FOR_MUM → FOR_PARENTS in the ServiceCluster enum.
-- Uses a DO block so it's safe even if the rename was already applied.
DO $$
BEGIN
  ALTER TYPE "ServiceCluster" RENAME VALUE 'FOR_MUM' TO 'FOR_PARENTS';
EXCEPTION
  WHEN invalid_parameter_value THEN NULL;  -- value doesn't exist, already renamed
  WHEN others THEN NULL;
END $$;

-- Add the new EVENT variant (IF NOT EXISTS guards against re-running).
ALTER TYPE "ServiceCluster" ADD VALUE IF NOT EXISTS 'EVENT';
