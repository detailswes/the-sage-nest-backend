/**
 * One-time backfill: re-sync every APPROVED expert's active services so Webflow
 * receives the Display Order field (see WEBFLOW_SERVICE_SORT_FIELD).
 *
 * Run from the backend directory, with WEBFLOW_SERVICE_SORT_FIELD set (e.g. display-order):
 *   node src/scripts/backfillServiceDisplayOrder.js --dry-run     # list what would be synced
 *   node src/scripts/backfillServiceDisplayOrder.js               # sync everyone
 *   node src/scripts/backfillServiceDisplayOrder.js --expert=43   # sync a single expert
 *
 * Safe to re-run — existing Webflow items are updated in place. Events are skipped
 * (they live in a separate collection and have no display order).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma         = require('../prisma/client');
const webflowService = require('../services/webflow.service');

const DRY_RUN  = process.argv.includes('--dry-run');
const onlyArg  = process.argv.find((a) => a.startsWith('--expert='));
const ONLY_ID  = onlyArg ? parseInt(onlyArg.split('=')[1], 10) : null;
const PAUSE_MS = 400; // stay well inside Webflow's API rate limit

async function main() {
  if (!process.env.WEBFLOW_SERVICE_SORT_FIELD) {
    console.error('WEBFLOW_SERVICE_SORT_FIELD is not set — the sync would not send Display Order. Aborting.');
    process.exit(1);
  }
  console.log(`Sort field: ${process.env.WEBFLOW_SERVICE_SORT_FIELD}${DRY_RUN ? '  (DRY RUN — nothing is sent)' : ''}\n`);

  const experts = await prisma.expert.findMany({
    where: {
      status: 'APPROVED',
      webflow_item_id: { not: null },
      ...(ONLY_ID ? { id: ONLY_ID } : {}),
    },
    include: {
      user:     { select: { name: true } },
      services: {
        where:   { is_active: true, cluster: { not: 'EVENT' }, webflow_item_id: { not: null } },
        orderBy: { sort_order: 'asc' },
        select:  { id: true, title: true, sort_order: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  if (experts.length === 0) { console.log('No matching experts — nothing to do.'); return; }

  let ok = 0, failed = 0;
  const failures = [];

  for (const expert of experts) {
    if (expert.services.length === 0) continue;
    console.log(`Expert ${expert.id} (${expert.user.name})`);
    for (const svc of expert.services) {
      const label = `  service ${svc.id} "${svc.title}" → Display Order ${svc.sort_order + 1}`;
      if (DRY_RUN) { console.log(`${label}  [dry run]`); continue; }
      try {
        await webflowService.syncService(svc.id, expert.id, expert.webflow_item_id);
        // syncService records failures on the row instead of throwing.
        const row = await prisma.service.findUnique({
          where: { id: svc.id }, select: { webflow_sync_status: true, webflow_sync_error: true },
        });
        if (row.webflow_sync_status === 'SYNCED') { console.log(`${label}  ✓`); ok++; }
        else { console.log(`${label}  ✗ ${row.webflow_sync_error}`); failed++; failures.push({ id: svc.id, error: row.webflow_sync_error }); }
      } catch (err) {
        console.log(`${label}  ✗ ${err.message}`); failed++; failures.push({ id: svc.id, error: err.message });
      }
      await webflowService.sleep(PAUSE_MS);
    }
  }

  if (DRY_RUN) return;
  console.log(`\nDone. ${ok} synced, ${failed} failed.`);
  if (failures.length) {
    console.log('Failures:'); failures.forEach((f) => console.log(`  service ${f.id}: ${f.error}`));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect().then(() => process.exit()));
