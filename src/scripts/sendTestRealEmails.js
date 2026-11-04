/**
 * Sends the REAL booking emails (real templates, real calendar invites) with
 * made-up booking data to test inboxes. No database access; nothing is booked.
 *
 * Run the stages in order, checking each inbox/calendar in between:
 *   node src/scripts/sendTestRealEmails.js new          --run=1 --send
 *   node src/scripts/sendTestRealEmails.js reschedule   --run=1 --send
 *   node src/scripts/sendTestRealEmails.js cancel       --run=1 --send   (parent + expert cancel their own session)
 *   node src/scripts/sendTestRealEmails.js platform     --run=1 --send   (Sage Nest cancels: admin/suspension, parent email)
 *   node src/scripts/sendTestRealEmails.js event-new    --run=1 --send
 *   node src/scripts/sendTestRealEmails.js event-cancel --run=1 --send   (expert cancels the whole event)
 *
 * Without --send nothing leaves the machine (Brevo call is stubbed, subjects are printed).
 * Use a fresh --run=N for fresh calendar events (the run number is part of the booking id).
 * Options: --expert=addr --parent=addr --lang=en|it --start=ISO (UTC, default tomorrow 09:00Z)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const STAGE = process.argv[2];
const SEND = process.argv.includes('--send');
const RUN = parseInt(arg('run', '1'), 10);
const LANG = arg('lang', 'en') === 'it' ? 'it' : 'en';
const EXPERT = arg('expert', 'navneeksingh.webethics@gmail.com');
const PARENT = arg('parent', 'amit.webethics@hotmail.com');

const STAGES = ['new', 'reschedule', 'cancel', 'platform', 'event-new', 'event-cancel'];
if (!STAGES.includes(STAGE)) {
  console.error(`Usage: node src/scripts/sendTestRealEmails.js <${STAGES.join('|')}> [--run=N] [--send]`);
  process.exit(1);
}

// Dry run: stub the Brevo call so the real functions run but nothing is sent.
if (!SEND) {
  global.fetch = async (_u, opts) => {
    const b = JSON.parse(opts.body);
    console.log(`   would send → ${b.to[0].email} | ${b.subject} | attachment: ${b.attachment ? b.attachment[0].name : 'none'}`);
    return { ok: true, status: 201, text: async () => '' };
  };
}

const email = require('../utils/email');

const bookingId = 900000 + RUN;   // far above real ids; the invite UID is derived from it
const eventId = 800000 + RUN;
const first = new Date(arg('start', (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(9, 0, 0, 0); return d.toISOString(); })()));
const moved = new Date(first.getTime() + 27 * 60 * 60 * 1000);
const T = 'TEST — ';
const ADDRESS = 'Via Roma 1, 00100 Roma';

const common = { language: LANG, durationMinutes: 60, bookingId };
const expertTz = 'Europe/Rome';
const parentTz = 'Europe/Copenhagen';
const policyUrl = `${process.env.CLIENT_URL}/legal`;

async function main() {
  console.log(`${SEND ? 'SENDING' : 'Dry run (pass --send to send)'} — stage=${STAGE} run=${RUN} lang=${LANG}\n`);

  if (STAGE === 'new' || STAGE === 'reschedule') {
    const when = STAGE === 'new' ? first : moved;
    // Parent: the confirmation email (a reschedule re-sends it with the new time — same UID).
    await email.sendBookingConfirmationEmail({
      ...common, to: PARENT, name: 'Test Parent', expertName: 'Test Expert', serviceTitle: `${T}Feeding coaching`,
      format: 'IN_PERSON', scheduledAt: when, location: ADDRESS, amount: 50, currency: 'EUR',
      timezone: parentTz, userTimezone: parentTz, withdrawalApplicable: false, policyUrl,
      termsUrl: policyUrl, privacyUrl: policyUrl,
    });
    // Expert: new-booking or reschedule email.
    if (STAGE === 'new') {
      await email.sendNewBookingNotificationEmail({
        ...common, to: EXPERT, expertName: 'Test Expert', parentName: 'Test Parent', parentEmail: PARENT,
        serviceTitle: `${T}Feeding coaching`, format: 'IN_PERSON', scheduledAt: when, location: ADDRESS,
        amount: 50, currency: 'EUR', timezone: expertTz, policyUrl,
      });
    } else {
      await email.sendRescheduleNotificationEmail({
        ...common, to: EXPERT, expertName: 'Test Expert', parentName: 'Test Parent', parentEmail: PARENT,
        serviceTitle: `${T}Feeding coaching`, format: 'IN_PERSON', previousScheduledAt: first,
        newScheduledAt: moved, location: ADDRESS, timezone: expertTz,
      });
    }
  }

  if (STAGE === 'cancel') {
    const base = { ...common, serviceTitle: `${T}Feeding coaching`, format: 'IN_PERSON', scheduledAt: moved, refundPercent: 100, amount: 50, currency: 'EUR' };
    await email.sendParentCancellationConfirmationEmail({ ...base, to: PARENT, parentName: 'Test Parent', expertName: 'Test Expert', timezone: parentTz });
    await email.sendBookingCancellationNotification({ ...base, to: EXPERT, expertName: 'Test Expert', parentName: 'Test Parent', timezone: expertTz });
  }

  if (STAGE === 'platform') {
    await email.sendPlatformCancellationEmailToParent({
      ...common, to: PARENT, parentName: 'Test Parent', expertName: 'Test Expert', serviceTitle: `${T}Feeding coaching`,
      scheduledAt: moved, timezone: parentTz, refundOutcome: 'issued', cancellationType: 'admin_cancelled',
      adminReason: 'Test cancellation from the admin panel',
    });
  }

  if (STAGE === 'event-new') {
    await email.sendEventBookingConfirmationEmail({
      ...common, to: PARENT, parentName: 'Test Parent', expertName: 'Test Expert', eventTitle: `${T}Weaning workshop`,
      format: 'IN_PERSON', scheduledAt: first, eventVenueName: 'Test venue', eventAddress: 'Via Roma 1',
      eventPostcode: '00100', eventCity: 'Roma', amount: 0, currency: 'EUR', withdrawalApplicable: false,
      recipientTimezone: parentTz, eventTermsUrl: policyUrl,
    });
    await email.sendEventNewBookingNotificationEmail({
      ...common, to: EXPERT, expertName: 'Test Expert', parentName: 'Test Parent', eventTitle: `${T}Weaning workshop`,
      eventId, bookingId, scheduledAt: first, format: 'IN_PERSON', eventVenueName: 'Test venue',
      eventAddress: 'Via Roma 1', eventPostcode: '00100', eventCity: 'Roma',
      spotsRemaining: 9, totalSpots: 10, isFree: true, amount: 0, currency: 'EUR', timezone: expertTz,
    });
  }

  if (STAGE === 'event-cancel') {
    await email.sendEventCancelledByExpertEmail({
      ...common, to: PARENT, parentName: 'Test Parent', expertName: 'Test Expert', eventTitle: `${T}Weaning workshop`,
      scheduledAt: first, format: 'IN_PERSON', isFree: true, amount: 0, currency: 'EUR', recipientTimezone: parentTz,
    });
    await email.sendExpertEventCancelledConfirmationEmail({
      to: EXPERT, expertName: 'Test Expert', eventTitle: `${T}Weaning workshop`, eventId,
      scheduledAt: first, attendeeCount: 1, timezone: expertTz, language: LANG,
    });
  }
  console.log('\ndone');
}

main().catch((e) => { console.error(e); process.exit(1); });
