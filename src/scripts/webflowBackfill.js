/**
 * One-time backfill: push all APPROVED experts + their active services to Webflow.
 * Run from the backend directory:
 *   node src/scripts/webflowBackfill.js
 *
 * Safe to re-run — experts already synced are updated in place, not duplicated.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma          = require('../prisma/client');
const webflowService  = require('../services/webflow.service');

async function main() {
  const experts = await prisma.expert.findMany({
    where:   { status: 'APPROVED' },
    include: {
      user:     { select: { name: true } },
      services: { where: { is_active: true }, select: { id: true, title: true } },
    },
    orderBy: { id: 'asc' },
  });

  if (experts.length === 0) {
    console.log('No APPROVED experts found — nothing to sync.');
    return;
  }

  console.log(`Found ${experts.length} approved expert(s). Starting sync...\n`);

  let expertOk = 0, expertFail = 0, serviceOk = 0, serviceFail = 0;

  for (const expert of experts) {
    process.stdout.write(`  Expert ${expert.id} (${expert.user.name}) — `);
    try {
      await webflowService.syncExpert(expert.id);
      process.stdout.write('✓ expert synced');
      expertOk++;

      if (expert.services.length > 0) {
        await webflowService.syncExpertServices(expert.id);
        process.stdout.write(`, ${expert.services.length} service(s) synced`);
        serviceOk += expert.services.length;
      }
      console.log();
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`);
      expertFail++;
    }
  }

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Experts : ${expertOk} synced, ${expertFail} failed`);
  console.log(`  Services: ${serviceOk} synced, ${serviceFail} failed`);
  if (expertFail > 0) {
    console.log('\n  Failed experts will be retried automatically by the 10-min sync job.');
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
