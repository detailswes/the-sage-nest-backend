const cron = require('node-cron');
const prisma = require('../prisma/client');
const { sendBookingReminderEmail } = require('../utils/email');

// ─── Core reminder logic (exported for testability) ───────────────────────────
async function runReminders() {
  const now = new Date();

  // ── 24h reminder window ────────────────────────────────────────────────────
  // Send when: session is within the next 24h AND reminder not yet sent.
  // Using lte: now+24h means even if the cron was down for a while and missed
  // the ideal window, it still catches up on the next tick.
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // ── 1h reminder window ─────────────────────────────────────────────────────
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);

  // Fetch all bookings that need either reminder in a single query
  const due = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      scheduled_at: { gt: now }, // session hasn't happened yet
      OR: [
        { reminder_24h_sent: false, scheduled_at: { lte: in24h } },
        { reminder_1h_sent:  false, scheduled_at: { lte: in1h  } },
      ],
    },
    include: {
      parent:  { select: { name: true, email: true } },
      expert:  { include: { user: { select: { name: true, email: true } } } },
      service: { select: { title: true } },
    },
  });

  if (due.length === 0) return;

  console.log(`[Reminders] ${due.length} booking(s) due for reminders`);

  for (const booking of due) {
    const sessionAt    = booking.scheduled_at;
    const msUntil      = sessionAt.getTime() - now.getTime();
    const hoursUntil   = msUntil / (1000 * 60 * 60);

    const expertName  = booking.expert?.user?.name  || 'Expert';
    const expertEmail = booking.expert?.user?.email;
    const parentName  = booking.parent?.name        || 'Parent';
    const parentEmail = booking.parent?.email;

    // ── 24h reminder ──────────────────────────────────────────────────────
    if (!booking.reminder_24h_sent && hoursUntil <= 24) {
      // Atomic claim: only the server whose UPDATE matches (false→true) proceeds.
      // If another server already flipped it, count=0 and we skip.
      const claimed = await prisma.booking.updateMany({
        where: { id: booking.id, reminder_24h_sent: false },
        data:  { reminder_24h_sent: true },
      });

      if (claimed.count > 0) {
        const sharedArgs = {
          serviceTitle:    booking.service?.title || 'Session',
          format:          booking.format,
          scheduledAt:     sessionAt,
          durationMinutes: booking.duration_minutes,
          reminderType:    '24h',
          bookingId:       booking.id,
        };

        if (parentEmail) {
          sendBookingReminderEmail({
            ...sharedArgs,
            to:             parentEmail,
            recipientName:  parentName,
            role:           'parent',
            otherPartyName: expertName,
          }).catch((e) => console.error(`[Reminders] 24h parent email failed (booking ${booking.id}):`, e.message));
        }

        if (expertEmail) {
          sendBookingReminderEmail({
            ...sharedArgs,
            to:             expertEmail,
            recipientName:  expertName,
            role:           'expert',
            otherPartyName: parentName,
          }).catch((e) => console.error(`[Reminders] 24h expert email failed (booking ${booking.id}):`, e.message));
        }

        console.log(`[Reminders] 24h reminder sent for booking ${booking.id}`);
      }
    }

    // ── 1h reminder ───────────────────────────────────────────────────────
    if (!booking.reminder_1h_sent && hoursUntil <= 1) {
      const claimed = await prisma.booking.updateMany({
        where: { id: booking.id, reminder_1h_sent: false },
        data:  { reminder_1h_sent: true },
      });

      if (claimed.count > 0) {
        const sharedArgs = {
          serviceTitle:    booking.service?.title || 'Session',
          format:          booking.format,
          scheduledAt:     sessionAt,
          durationMinutes: booking.duration_minutes,
          reminderType:    '1h',
          bookingId:       booking.id,
        };

        if (parentEmail) {
          sendBookingReminderEmail({
            ...sharedArgs,
            to:             parentEmail,
            recipientName:  parentName,
            role:           'parent',
            otherPartyName: expertName,
          }).catch((e) => console.error(`[Reminders] 1h parent email failed (booking ${booking.id}):`, e.message));
        }

        if (expertEmail) {
          sendBookingReminderEmail({
            ...sharedArgs,
            to:             expertEmail,
            recipientName:  expertName,
            role:           'expert',
            otherPartyName: parentName,
          }).catch((e) => console.error(`[Reminders] 1h expert email failed (booking ${booking.id}):`, e.message));
        }

        console.log(`[Reminders] 1h reminder sent for booking ${booking.id}`);
      }
    }
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startReminderJob() {
  // Runs every 5 minutes — same cadence as the other jobs
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runReminders();
    } catch (err) {
      console.error('[Reminders] Unexpected error during reminder run:', err);
    }
  });

  console.log('[Reminders] Session reminder job scheduled (runs every 5 min)');
}

module.exports = { startReminderJob, runReminders };
