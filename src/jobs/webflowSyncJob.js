const cron   = require('node-cron');
const prisma  = require('../prisma/client');
const { syncExpert, syncService } = require('../services/webflow.service');

async function runWebflowSync() {
  if (!process.env.WEBFLOW_API_TOKEN) return;

  // Retry FAILED experts that are still live (APPROVED + published)
  const failedExperts = await prisma.expert.findMany({
    where:  { webflow_sync_status: 'FAILED', status: 'APPROVED', is_published: true },
    select: { id: true },
  });

  for (const expert of failedExperts) {
    await syncExpert(expert.id).catch(() => {}); // status updated inside syncExpert
  }

  // Retry FAILED services whose expert is already synced
  const failedServices = await prisma.service.findMany({
    where: {
      webflow_sync_status: 'FAILED',
      is_active:           true,
      expert:              { status: 'APPROVED', webflow_item_id: { not: null } },
    },
    select: { id: true },
  });

  for (const svc of failedServices) {
    await syncService(svc.id).catch(() => {});
  }

  if (failedExperts.length || failedServices.length) {
    console.log(
      `[WebflowSync] Retried ${failedExperts.length} expert(s), ${failedServices.length} service(s)`,
    );
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

  console.log('[WebflowSync] Retry job scheduled (every 10 min)');
}

module.exports = { startWebflowSyncJob, runWebflowSync };
