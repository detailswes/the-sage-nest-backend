const cron = require('node-cron');
const prisma = require('../prisma/client');

// ─── Core completion logic (exported for testability) ─────────────────────────
async function runMarkCompleted() {
  const now = new Date();

  // Fetch CONFIRMED bookings whose session start time has already passed.
  // We can't do (scheduled_at + duration_minutes) arithmetic in Prisma's where
  // clause without raw SQL, so we pull candidates and filter in JS.
  const candidates = await prisma.booking.findMany({
    where: {
      status:       'CONFIRMED',
      scheduled_at: { lte: now },
    },
    select: { id: true, scheduled_at: true, duration_minutes: true },
  });

  if (candidates.length === 0) return;

  // Keep only bookings whose end time (start + duration) has fully passed.
  const completedIds = candidates
    .filter((b) => {
      const endTime = new Date(b.scheduled_at.getTime() + b.duration_minutes * 60 * 1000);
      return endTime <= now;
    })
    .map((b) => b.id);

  if (completedIds.length === 0) return;

  // Atomic update — status guard prevents any race with a concurrent run.
  const result = await prisma.booking.updateMany({
    where: { id: { in: completedIds }, status: 'CONFIRMED' },
    data:  { status: 'COMPLETED', completed_at: now },
  });

  console.log(`[Complete] Marked ${result.count} booking(s) as COMPLETED`);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startMarkCompletedJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runMarkCompleted();
    } catch (err) {
      console.error('[Complete] Unexpected error during completion run:', err);
    }
  });

  console.log('[Complete] Booking completion job scheduled (runs every 5 min)');
}

module.exports = { startMarkCompletedJob, runMarkCompleted };
