/* eslint-disable no-console */
// One-off: re-push every live event's availability to Webflow under the current rules —
// total seats cleared, "spots left" shown only when 1–5 remain, Sold out switch at 0.
// Routine 5-minute job ticks skip events whose visible state hasn't changed, so events
// synced before this rule keep their old numbers until this runs (or until a spot changes).
//
//   node src/scripts/resyncEventAvailability.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const prisma = require('../prisma/client');
const { syncEvent } = require('../services/webflow.service');

(async () => {
  const events = await prisma.service.findMany({
    where:  { cluster: 'EVENT', webflow_item_id: { not: null }, webflow_archived_at: null },
    select: { id: true, title: true },
  });
  console.log(`Re-syncing ${events.length} event(s)…`);
  let ok = 0;
  for (const e of events) {
    try {
      await syncEvent(e.id); // no `source: 'job'` → bypasses the unchanged-state skip
      ok += 1;
      console.log(`  ✓ #${e.id} ${e.title}`);
    } catch (err) {
      console.error(`  ✗ #${e.id} ${e.title}: ${err.message}`);
    }
  }
  console.log(`Done: ${ok}/${events.length} synced.`);
  await prisma.$disconnect();
})();
