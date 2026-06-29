/**
 * One-time script: upsert all existing verified parents into Brevo.
 *
 * Usage:
 *   node scripts/syncParentsToBrevo.js
 *
 * Requires:
 *   BREVO_API_KEY in .env
 *   BREVO_PARENTS_LIST_ID in .env (optional — if set, parents are added to that list)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const prisma = require('../src/prisma/client');
const { addOrUpdateBrevoContact } = require('../src/utils/brevo');

const BATCH_SIZE = 10;
const DELAY_MS = 150; // stay well under Brevo's ~10 req/s limit

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Fetching all verified, active parents from the database...');

  const parents = await prisma.user.findMany({
    where: {
      role: 'PARENT',
      is_verified: true,
      account_deleted: false,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      pp_acceptances: {
        orderBy: { accepted_at: 'desc' },
        take: 1,
        select: { marketing_consent: true },
      },
    },
  });

  console.log(`Found ${parents.length} parent(s) to sync.\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < parents.length; i += BATCH_SIZE) {
    const batch = parents.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (parent) => {
      const marketingConsent = parent.pp_acceptances[0]?.marketing_consent ?? false;
      try {
        await addOrUpdateBrevoContact({
          email: parent.email,
          name: parent.name,
          phone: parent.phone,
          marketingConsent,
        });
        success++;
        console.log(`  ✓ ${parent.email}  (marketing consent: ${marketingConsent})`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${parent.email}: ${err.message}`);
      }
    }));

    if (i + BATCH_SIZE < parents.length) {
      await delay(DELAY_MS);
    }
  }

  console.log(`\nDone — ${success} synced, ${failed} failed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
