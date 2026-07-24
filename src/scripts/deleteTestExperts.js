/**
 * Deletes one or more expert accounts entirely (User row + everything that
 * cascades from it: Expert profile, services, bookings, reviews, business
 * info, qualifications, certifications, insurance, availability, etc.) —
 * for pre-launch test/QA experts only, e.g. accounts that were onboarded
 * against a developer's own Stripe test account before the client's live
 * Stripe keys were wired in, and can't be reconnected in place.
 *
 * Relies on the FK-level ON DELETE CASCADE already defined for every
 * Expert-owned relation in prisma/schema.prisma — deleting the User row is
 * enough; Postgres cascades the rest.
 *
 * Also cleans up Webflow: if the expert (or any of their services) was
 * synced, webflowService.deleteExpertFromWebflow runs FIRST, while the
 * Postgres rows still exist — it looks up the expert's synced services by
 * querying Postgres, so it has to happen before the cascade delete removes
 * them. Never call this after the Postgres delete; the Webflow items would
 * be orphaned with nothing left in the app to identify or clean them up.
 *
 * Always reports what would be deleted first. Nothing is written unless
 * --confirm is passed explicitly.
 *
 * Run from the backend directory:
 *   node src/scripts/deleteTestExperts.js <expertId1,expertId2,...>            # report only
 *   node src/scripts/deleteTestExperts.js <expertId1,expertId2,...> --confirm   # actually delete
 *
 * Example:
 *   node src/scripts/deleteTestExperts.js 5,6 --confirm
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = require('../prisma/client');
const webflowService = require('../services/webflow.service');

const CONFIRM = process.argv.includes('--confirm');
const idArg = process.argv[2];

async function main() {
  if (!idArg || idArg === '--confirm') {
    console.error('Usage: node src/scripts/deleteTestExperts.js <expertId1,expertId2,...> [--confirm]');
    process.exit(1);
  }
  const expertIds = idArg.split(',').map((s) => parseInt(s.trim(), 10));

  console.log(CONFIRM ? 'Applying deletion.\n' : 'Report-only mode — pass --confirm to actually delete.\n');

  for (const expertId of expertIds) {
    const expert = await prisma.expert.findUnique({
      where: { id: expertId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: {
          select: {
            services: true, bookings: true, reviews: true,
            qualifications: true, certifications: true,
            availability: true, blockouts: true, saved_by: true,
          },
        },
      },
    });

    if (!expert) {
      console.log(`Expert ${expertId} — not found, skipping.`);
      continue;
    }

    console.log(`Expert ${expertId} (${expert.user.name} <${expert.user.email}>) — will delete:`);
    console.log(`  services: ${expert._count.services}, bookings: ${expert._count.bookings}, reviews: ${expert._count.reviews}`);
    console.log(`  qualifications: ${expert._count.qualifications}, certifications: ${expert._count.certifications}`);
    console.log(`  availability rows: ${expert._count.availability}, blockouts: ${expert._count.blockouts}, saved-by: ${expert._count.saved_by}`);
    console.log(`  stripe_account_id: ${expert.stripe_account_id || '(none)'}`);
    console.log(`  webflow_item_id: ${expert.webflow_item_id || '(not synced)'}`);

    if (CONFIRM) {
      if (expert.webflow_item_id) {
        console.log('  → cleaning up Webflow (expert + any synced services) first…');
        try {
          await webflowService.deleteExpertFromWebflow(expert.id, expert.webflow_item_id);
          console.log('  → Webflow cleanup done');
        } catch (e) {
          // deleteExpertFromWebflow already catches its own errors and never
          // throws (GDPR deletion must succeed regardless of Webflow state),
          // so this is just an extra safety net.
          console.log(`  → Webflow cleanup failed, continuing anyway: ${e.message}`);
        }
      }

      await prisma.user.delete({ where: { id: expert.user.id } });
      console.log(`  → deleted (user ${expert.user.id} + cascade)\n`);
    } else {
      console.log('');
    }
  }

  if (!CONFIRM) {
    console.log('Nothing was deleted. Re-run with --confirm to apply.');
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
