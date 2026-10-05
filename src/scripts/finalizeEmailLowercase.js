/**
 * Finishes the email-lowercasing started by migration
 * 20261005120000_lowercase_user_emails, once case-duplicate accounts have been
 * resolved (one deleted, or otherwise renamed) by hand:
 *   1. lowercases any remaining mixed-case User.email / pending_email
 *   2. creates the case-insensitive unique index User_email_lower_key
 *
 * If case-duplicates still exist, it lists them and changes nothing.
 * Report-only unless --confirm is passed. Safe to re-run.
 *
 * Run from the backend directory:
 *   node src/scripts/finalizeEmailLowercase.js            # report only
 *   node src/scripts/finalizeEmailLowercase.js --confirm  # apply
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = require('../prisma/client');

const CONFIRM = process.argv.includes('--confirm');

async function main() {
  console.log(CONFIRM ? 'Applying changes.\n' : 'Report-only mode — pass --confirm to apply.\n');

  const dupes = await prisma.$queryRaw`
    SELECT lower(email) AS email, array_agg(id ORDER BY id) AS ids, array_agg(email ORDER BY id) AS stored
    FROM "User" GROUP BY lower(email) HAVING count(*) > 1`;
  if (dupes.length) {
    console.log('Case-duplicate accounts still exist — resolve these first, nothing changed:');
    for (const d of dupes) console.log(`  ${d.email}: ids ${d.ids.join(', ')} stored as ${d.stored.join(' | ')}`);
    return;
  }

  const [{ n: mixed }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "User" WHERE email <> lower(email)`;
  const [{ n: mixedPending }] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM "User" WHERE pending_email IS NOT NULL AND pending_email <> lower(pending_email)`;
  const [{ n: hasIndex }] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'User_email_lower_key'`;
  console.log(`Mixed-case emails: ${mixed}, mixed-case pending emails: ${mixedPending}, index exists: ${hasIndex > 0}`);

  if (!CONFIRM) return;

  await prisma.$executeRaw`UPDATE "User" SET email = lower(email) WHERE email <> lower(email)`;
  await prisma.$executeRaw`
    UPDATE "User" SET pending_email = lower(pending_email)
    WHERE pending_email IS NOT NULL AND pending_email <> lower(pending_email)`;
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email))'
  );
  console.log('Done: emails lowercased, unique index in place.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
