const cron   = require('node-cron');
const prisma  = require('../prisma/client');
const { retryDeadLetter } = require('../services/webflow.service');
const { sendWebflowQueueThresholdAlert } = require('../utils/email');

const QUEUE_THRESHOLD = Number(process.env.WEBFLOW_FAILURE_QUEUE_THRESHOLD) || 10;
// Throttle the queue-depth alert to at most once per hour, independent of tick cadence.
const THRESHOLD_ALERT_THROTTLE_MS = 60 * 60 * 1000;
let lastThresholdAlertAt = 0;

async function runWebflowSync() {
  if (!process.env.WEBFLOW_API_TOKEN) return;

  // Sweep the dead-letter queue: each row gets its original operation (sync/archive/delete)
  // replayed via retryDeadLetter, re-entering the full retry+backoff+dead-letter cycle
  // (see webflow.service.js).
  const pending = await prisma.webflowSyncFailure.findMany({
    where:  { status: 'PENDING_RETRY' },
    select: { id: true, entity_type: true, entity_id: true, payload: true },
  });

  let retried = 0;
  for (const failure of pending) {
    await retryDeadLetter(failure).catch(() => {}); // status/dead-letter row updated inside
    retried++;
  }

  if (retried) {
    console.log(`[WebflowSync] Swept ${retried} dead-lettered item(s) from the retry queue`);
  }

  const pendingCount = await prisma.webflowSyncFailure.count({ where: { status: 'PENDING_RETRY' } });
  if (pendingCount > QUEUE_THRESHOLD && Date.now() - lastThresholdAlertAt > THRESHOLD_ALERT_THROTTLE_MS) {
    lastThresholdAlertAt = Date.now();
    await sendWebflowQueueThresholdAlert({ pendingCount, threshold: QUEUE_THRESHOLD })
      .catch(err => console.error('[WebflowSync] Failed to send queue-threshold alert:', err.message));
  }
}

function startWebflowSyncJob() {
  if (!process.env.WEBFLOW_API_TOKEN) {
    console.log('[WebflowSync] WEBFLOW_API_TOKEN not set — sync job disabled');
    return;
  }

  cron.schedule('*/10 * * * *', async () => {
    try {
      await runWebflowSync();
    } catch (err) {
      console.error('[WebflowSync] Unexpected error:', err.message);
    }
  });

  console.log('[WebflowSync] Dead-letter sweep job scheduled (every 10 min)');
}

module.exports = { startWebflowSyncJob, runWebflowSync };
