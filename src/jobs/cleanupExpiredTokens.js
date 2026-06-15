const cron = require('node-cron');
const prisma = require('../prisma/client');

// Retention constants — single source of truth for all data lifetime decisions
const STRIPE_EVENT_RETENTION_DAYS  = 30;   // processed events; Stripe API keeps 30 days
const NOTIFICATION_RETENTION_DAYS  = 90;   // read/unread in-app notifications
const SLOT_LOCK_GRACE_MINUTES       = 60;   // buffer past expires_at before bulk-purging

async function runTokenCleanup() {
  const now = new Date();

  // ── Refresh tokens ─────────────────────────────────────────────────────────
  const tokens = await prisma.refreshToken.deleteMany({
    where: { expires_at: { lt: now } },
  });
  if (tokens.count > 0) console.log(`[Retention] Deleted ${tokens.count} expired refresh token(s)`);

  // ── Stripe dedup events older than 30 days ─────────────────────────────────
  // Processed events have no residual value past Stripe's own 30-day window.
  // Unprocessed events older than 30 days can no longer be re-fetched from
  // the Stripe API, so retrying them would also fail — safe to purge both.
  const stripeEventCutoff = new Date(now.getTime() - STRIPE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const stripeEvents = await prisma.stripeEvent.deleteMany({
    where: { processed_at: { lt: stripeEventCutoff } },
  });
  if (stripeEvents.count > 0) console.log(`[Retention] Deleted ${stripeEvents.count} old StripeEvent record(s)`);

  // ── Notifications older than 90 days ──────────────────────────────────────
  const notifCutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const notifs = await prisma.notification.deleteMany({
    where: { created_at: { lt: notifCutoff } },
  });
  if (notifs.count > 0) console.log(`[Retention] Deleted ${notifs.count} old notification(s)`);

  // ── Expired slot locks ─────────────────────────────────────────────────────
  // Locks are also deleted inline on each new lock attempt, but abandoned
  // checkout flows leave orphaned rows that are never revisited.
  const slotLockCutoff = new Date(now.getTime() - SLOT_LOCK_GRACE_MINUTES * 60 * 1000);
  const slotLocks = await prisma.slotLock.deleteMany({
    where: { expires_at: { lt: slotLockCutoff } },
  });
  if (slotLocks.count > 0) console.log(`[Retention] Deleted ${slotLocks.count} expired slot lock(s)`);
}

function startTokenCleanupJob() {
  cron.schedule('0 3 * * *', async () => {
    try {
      await runTokenCleanup();
    } catch (err) {
      console.error('[Retention] Unexpected error in daily cleanup:', err);
    }
  });

  console.log('[Retention] Daily data-retention cleanup scheduled (03:00)');
}

module.exports = { startTokenCleanupJob, runTokenCleanup };
