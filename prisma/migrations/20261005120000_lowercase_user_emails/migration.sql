-- Lowercase existing emails. Accounts whose lowercased email would collide with
-- another account are left untouched so this migration never fails. They, and the
-- case-insensitive unique index, are handled afterwards by:
--   node src/scripts/finalizeEmailLowercase.js --confirm
UPDATE "User" u SET email = lower(u.email)
WHERE u.email <> lower(u.email)
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o.id <> u.id AND lower(o.email) = lower(u.email));

UPDATE "User" SET pending_email = lower(pending_email)
WHERE pending_email IS NOT NULL AND pending_email <> lower(pending_email);
