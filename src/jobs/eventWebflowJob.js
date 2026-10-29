const cron   = require('node-cron');
const prisma = require('../prisma/client');
const { syncEvent } = require('../services/webflow.service');

// Keeps Webflow in step with events between edits: pushes changed spots-left /
// sold-out state (bookings and cancellations happen in many places, so this
// reconciles rather than hooking each one) and archives events that have ended
// or been cancelled. syncEvent skips events whose availability hasn't changed.
async function runEventWebflowSync() {
  if (!process.env.WEBFLOW_API_TOKEN || !process.env.WEBFLOW_EVENTS_COLLECTION_ID) return;

  const events = await prisma.service.findMany({
    where:  { cluster: 'EVENT', webflow_item_id: { not: null }, webflow_archived_at: null },
    select: { id: true },
  });

  for (const { id } of events) {
    await syncEvent(id, { source: 'job' }).catch(err =>
      console.error(`[EventWebflow] Event ${id} sync failed:`, err.message));
  }
}

function startEventWebflowJob() {
  if (!process.env.WEBFLOW_API_TOKEN || !process.env.WEBFLOW_EVENTS_COLLECTION_ID) {
    console.log('[EventWebflow] Webflow events not configured — job disabled');
    return;
  }

  cron.schedule('*/5 * * * *', async () => {
    try {
      await runEventWebflowSync();
    } catch (err) {
      console.error('[EventWebflow] Unexpected error:', err.message);
    }
  });

  console.log('[EventWebflow] Event availability/archive sync scheduled (every 5 min)');
}

module.exports = { startEventWebflowJob, runEventWebflowSync };
