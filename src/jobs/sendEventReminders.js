const cron = require('node-cron');
const prisma = require('../prisma/client');
const { sendEventReminderEmail, sendEventVideoLinkMissingAlertEmail } = require('../utils/email');

// ─── 24h event reminder (parent only — see sendReminders.js for 1:1 sessions,
// which this job's bookings are explicitly excluded from) ─────────────────────
//
// One reminder per attendee, at the 24h mark, reusing the same
// reminder_24h_sent flag the generic job uses (a booking is only ever one or
// the other, keyed by its service's cluster). Carries the video link for
// online events, the venue for in-person — see eventReminderEmail.js.
async function runEventReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      scheduled_at: { gt: now, lte: in24h },
      reminder_24h_sent: false,
      service: { cluster: 'EVENT' },
    },
    include: {
      parent: { select: { name: true, email: true, language: true, timezone: true, notify_session_reminder: true } },
      expert: { select: { timezone: true, user: { select: { name: true } } } },
      service: { select: { title: true, format: true, event_venue_name: true, event_address: true, event_postcode: true, event_city: true, video_link: true } },
    },
  });

  if (due.length === 0) return;
  console.log(`[EventReminders] ${due.length} event booking(s) due for their 24h reminder`);

  for (const booking of due) {
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, reminder_24h_sent: false },
      data: { reminder_24h_sent: true },
    });
    if (claimed.count === 0) continue; // another server already claimed it

    if (!booking.parent?.email || booking.parent.notify_session_reminder === false) continue;

    sendEventReminderEmail({
      to: booking.parent.email,
      parentName: booking.parent.name,
      expertName: booking.expert?.user?.name || 'Expert',
      eventTitle: booking.service.title,
      format: booking.service.format,
      scheduledAt: booking.scheduled_at,
      eventVenueName: booking.service.event_venue_name,
      eventAddress: booking.service.event_address,
      eventPostcode: booking.service.event_postcode,
      eventCity: booking.service.event_city,
      videoLink: booking.service.video_link,
      bookingId: booking.id,
      recipientTimezone: booking.parent.timezone || booking.expert?.timezone,
      language: booking.parent.language,
    }).catch((e) => console.error(`[EventReminders] 24h reminder failed (booking ${booking.id}):`, e.message));
  }
}

// ─── 36h missing-video-link alert (expert) ─────────────────────────────────────
//
// Fires once per event that's within 36h of starting, is ONLINE, and still
// has no video link — video_link_alert_sent stops it repeating every 5 min
// until the link is added (which resets the flag — see service.controller.js
// and admin.controller.js's draft-approval merge).
async function runVideoLinkAlerts() {
  const now = new Date();
  const in36h = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  const due = await prisma.service.findMany({
    where: {
      cluster: 'EVENT',
      format: 'ONLINE',
      video_link: null,
      video_link_alert_sent: false,
      event_starts_at: { gt: now, lte: in36h },
    },
    include: { expert: { select: { timezone: true, user: { select: { name: true, email: true, language: true } } } } },
  });

  if (due.length === 0) return;
  console.log(`[EventReminders] ${due.length} online event(s) still missing a video link within 36h`);

  for (const service of due) {
    const claimed = await prisma.service.updateMany({
      where: { id: service.id, video_link_alert_sent: false },
      data: { video_link_alert_sent: true },
    });
    if (claimed.count === 0) continue;

    if (!service.expert?.user?.email) continue;

    sendEventVideoLinkMissingAlertEmail({
      to: service.expert.user.email,
      expertName: service.expert.user.name,
      eventTitle: service.title,
      scheduledAt: service.event_starts_at,
      timezone: service.expert?.timezone,
      language: service.expert.user.language,
    }).catch((e) => console.error(`[EventReminders] Missing-link alert failed (service ${service.id}):`, e.message));
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startEventReminderJob() {
  // Same 5-min cadence as the other reminder/alert jobs.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runEventReminders();
    } catch (err) {
      console.error('[EventReminders] Unexpected error during 24h reminder run:', err);
    }
    try {
      await runVideoLinkAlerts();
    } catch (err) {
      console.error('[EventReminders] Unexpected error during missing-link alert run:', err);
    }
  });

  console.log('[EventReminders] Event reminder + missing-link alert job scheduled (runs every 5 min)');
}

module.exports = { startEventReminderJob, runEventReminders, runVideoLinkAlerts };
