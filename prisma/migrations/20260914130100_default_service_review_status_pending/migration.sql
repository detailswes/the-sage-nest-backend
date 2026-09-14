-- Flip the column default for future inserts only. Existing rows were
-- explicitly backfilled to APPROVED by the previous migration and are
-- untouched by this statement.
ALTER TABLE "Service" ALTER COLUMN "review_status" SET DEFAULT 'PENDING_REVIEW';
