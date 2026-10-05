-- Case-insensitive uniqueness for User.email. Idempotent: already present on
-- environments where src/scripts/finalizeEmailLowercase.js created it. Skipped
-- with a notice if case-duplicates remain, so it never blocks a deploy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipping User_email_lower_key: case-duplicate emails still exist.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
  END IF;
END $$;
