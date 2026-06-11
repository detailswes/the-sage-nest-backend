const cron = require('node-cron');
const prisma = require('../prisma/client');

async function runTokenCleanup() {
  const result = await prisma.refreshToken.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });

  if (result.count > 0) {
    console.log(`[TokenCleanup] Deleted ${result.count} expired refresh token(s)`);
  }
}

function startTokenCleanupJob() {
  // Runs once a day at 03:00 — expired tokens are already rejected on use,
  // so sub-hourly precision is unnecessary.
  cron.schedule('0 3 * * *', async () => {
    try {
      await runTokenCleanup();
    } catch (err) {
      console.error('[TokenCleanup] Unexpected error:', err);
    }
  });

  console.log('[TokenCleanup] Expired refresh token cleanup scheduled (daily at 03:00)');
}

module.exports = { startTokenCleanupJob, runTokenCleanup };
