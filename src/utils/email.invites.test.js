const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BREVO_API_KEY = 'test-key';
process.env.EMAIL_FROM_NOTIFICATIONS = 'notifications@sagenest.org';
process.env.CLIENT_URL = 'https://app.example.org';

const email = require('./email');

// Capture what would be posted to Brevo.
let calls;
let failAttachments = false;
const realFetch = global.fetch;
test.beforeEach(() => {
  calls = [];
  failAttachments = false;
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    if (failAttachments && body.attachment) return { ok: false, status: 400, text: async () => 'attachments not allowed' };
    return { ok: true, status: 201, text: async () => '' };
  };
});
test.after(() => { global.fetch = realFetch; });

const ics = (call) => Buffer.from(call.attachment[0].content, 'base64').toString('utf8').replace(/\r\n[ \t]/g, '');
const when = new Date('2026-11-04T09:00:00.000Z');

const sessionBase = {
  to: 'x@example.org', serviceTitle: 'Feeding coaching', format: 'IN_PERSON', scheduledAt: when,
  durationMinutes: 60, bookingId: 42, language: 'en',
};

test('parent confirmation: REQUEST for the parent, local time, practice address', async () => {
  await email.sendBookingConfirmationEmail({
    ...sessionBase, name: 'Anna', expertName: 'Giulia', location: 'Via Roma 1, Roma',
    amount: 50, currency: 'EUR', userTimezone: 'Europe/Rome',
  });
  const f = ics(calls[0]);
  assert.match(f, /METHOD:REQUEST/);
  assert.match(f, /UID:booking-42-parent@sagenest\.org/);
  assert.match(f, /DTSTART;TZID=Europe\/Rome:20261104T100000/);
  assert.match(f, /SUMMARY:Feeding coaching – Giulia/);
  assert.match(f, /LOCATION:Via Roma 1\\, Roma/);
  assert.match(f, /DESCRIPTION:In-person session/);
  assert.equal((f.match(/^ATTENDEE/gm) || []).length, 1);
  assert.ok(f.includes('mailto:x@example.org'));
});

test('expert new-booking: REQUEST for the expert UID, parent email not in the invite', async () => {
  await email.sendNewBookingNotificationEmail({
    ...sessionBase, to: 'expert@example.org', expertName: 'Giulia', parentName: 'Anna',
    parentEmail: 'anna-secret@example.org', amount: 50, currency: 'EUR', timezone: 'Europe/Rome',
  });
  const f = ics(calls[0]);
  assert.match(f, /UID:booking-42-expert@sagenest\.org/);
  assert.match(f, /SUMMARY:Feeding coaching – Anna/);
  assert.ok(!f.includes('anna-secret@example.org'));
});

test('reschedule: expert gets an update with the NEW time and the same UID', async () => {
  const newTime = new Date('2026-11-05T12:00:00.000Z');
  await email.sendRescheduleNotificationEmail({
    to: 'expert@example.org', expertName: 'Giulia', parentName: 'Anna', parentEmail: 'a@example.org',
    serviceTitle: 'Feeding coaching', format: 'IN_PERSON', previousScheduledAt: when,
    newScheduledAt: newTime, durationMinutes: 60, bookingId: 42, timezone: 'Europe/Rome',
    language: 'en', location: 'Via Roma 1, Roma',
  });
  const f = ics(calls[0]);
  assert.match(f, /METHOD:REQUEST/);
  assert.match(f, /UID:booking-42-expert@sagenest\.org/);
  assert.match(f, /DTSTART;TZID=Europe\/Rome:20261105T130000/);
  assert.match(f, /LOCATION:Via Roma 1/);
});

test('cancellations carry a CANCEL for the right recipient, in Italian when asked', async () => {
  await email.sendExpertCancelledSessionEmail({
    to: 'p@example.org', parentName: 'Anna', expertName: 'Giulia', serviceTitle: 'Coaching',
    scheduledAt: when, amount: 50, currency: 'EUR', bookingId: 42, timezone: 'Europe/Copenhagen', language: 'it',
  });
  let f = ics(calls[0]);
  assert.match(f, /METHOD:CANCEL/);
  assert.match(f, /STATUS:CANCELLED/);
  assert.match(f, /UID:booking-42-parent@sagenest\.org/);
  assert.match(f, /SUMMARY:Annullato: Coaching – Giulia/);

  await email.sendBookingCancellationNotification({
    to: 'e@example.org', expertName: 'Giulia', parentName: 'Anna', serviceTitle: 'Coaching', format: 'ONLINE',
    scheduledAt: when, refundPercent: 100, amount: 50, bookingId: 42, timezone: 'Europe/Rome', language: 'en',
  });
  f = ics(calls[1]);
  assert.match(f, /METHOD:CANCEL/);
  assert.match(f, /UID:booking-42-expert@sagenest\.org/);
});

test('admin refund email only removes the event when flagged as a cancellation', async () => {
  const base = {
    to: 'p@example.org', parentName: 'Anna', expertName: 'Giulia', serviceTitle: 'Coaching',
    scheduledAt: when, refundAmount: 50, currency: 'EUR', isPartial: false, reason: 'x',
    bookingId: 42, timezone: 'Europe/Rome', language: 'en',
  };
  await email.sendRefundNotificationToParent(base);
  assert.equal(calls[0].attachment, undefined);
  await email.sendRefundNotificationToParent({ ...base, cancelsBooking: true });
  assert.match(ics(calls[1]), /METHOD:CANCEL/);
});

const eventBase = {
  to: 'x@example.org', eventTitle: 'Weaning workshop', format: 'IN_PERSON', scheduledAt: when, durationMinutes: 90,
  eventVenueName: 'Casa Nido', eventAddress: 'Via Po 3', eventPostcode: '00198', eventCity: 'Roma',
  bookingId: 7, eventId: 5, language: 'en',
};

test('event: each attendee gets their own booking UID', async () => {
  await email.sendEventBookingConfirmationEmail({
    ...eventBase, parentName: 'Anna', expertName: 'Giulia', amount: 20, currency: 'EUR', recipientTimezone: 'Europe/Rome',
  });
  const f = ics(calls[0]);
  assert.match(f, /UID:booking-7-parent@sagenest\.org/);
  assert.match(f, /LOCATION:Casa Nido\\, Via Po 3\\, 00198 Roma/);
});

test('event: the expert gets ONE calendar entry, only on the first booking', async () => {
  const exp = { ...eventBase, to: 'expert@example.org', expertName: 'Giulia', parentName: 'Anna', amount: 20, currency: 'EUR', timezone: 'Europe/Rome', totalSpots: 10 };
  await email.sendEventNewBookingNotificationEmail({ ...exp, spotsRemaining: 9 }); // first attendee
  assert.match(ics(calls[0]), /UID:event-5-expert@sagenest\.org/);
  await email.sendEventNewBookingNotificationEmail({ ...exp, bookingId: 8, spotsRemaining: 8 }); // second
  assert.equal(calls[1].attachment, undefined);
});

test('an online event has no location', async () => {
  await email.sendEventBookingConfirmationEmail({
    ...eventBase, format: 'ONLINE', parentName: 'Anna', expertName: 'Giulia', amount: 20, currency: 'EUR', recipientTimezone: 'Europe/Rome',
  });
  assert.ok(!ics(calls[0]).includes('LOCATION'));
});

test('if Brevo rejects the attachment the email is still sent without it', async () => {
  failAttachments = true;
  await email.sendBookingConfirmationEmail({
    ...sessionBase, name: 'Anna', expertName: 'Giulia', amount: 50, currency: 'EUR', userTimezone: 'Europe/Rome',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].attachment);
  assert.equal(calls[1].attachment, undefined);
});

test('emails without an invite are unchanged (no attachment field)', async () => {
  await email.sendEventParentCancelledNotificationEmail({
    to: 'e@example.org', expertName: 'Giulia', parentName: 'Anna', eventTitle: 'Workshop', scheduledAt: when,
    durationMinutes: 90, spotsRemaining: 5, totalSpots: 10, eventWasFull: false, isFree: true, refundPercent: 100,
    bookingId: 7, timezone: 'Europe/Rome', language: 'en',
  });
  assert.equal(calls[0].attachment, undefined);
});

test('platform cancel to parent: CANCEL for the parent UID, outcome wording in both languages', async () => {
  await email.sendPlatformCancellationEmailToParent({
    ...sessionBase, parentName: 'Anna', expertName: 'Giulia', timezone: 'Europe/Copenhagen',
    refundOutcome: 'review', cancellationType: 'account_closure',
  });
  await email.sendPlatformCancellationEmailToParent({
    ...sessionBase, parentName: 'Anna', expertName: 'Giulia', language: 'it', refundOutcome: 'issued',
  });
  const f = ics(calls[0]);
  assert.match(f, /METHOD:CANCEL/);
  assert.match(f, /UID:booking-42-parent@sagenest\.org/);
  assert.match(f, /DTSTART;TZID=Europe\/Copenhagen:20261104T100000/);
  assert.match(calls[0].htmlContent, /reviewing this booking/);
  assert.match(calls[0].htmlContent, /account has been suspended/);
  assert.match(calls[1].htmlContent, /rimborso sul metodo di pagamento originale/);
  assert.match(ics(calls[1]), /SUMMARY:Annullato: /);
});

test('expert whole-event cancel confirmation: CANCEL on the shared event UID, one email', async () => {
  await email.sendExpertEventCancelledConfirmationEmail({
    to: 'expert@example.org', expertName: 'Giulia', eventTitle: 'Weaning workshop', eventId: 9,
    scheduledAt: when, attendeeCount: 4, timezone: 'Europe/Rome', language: 'en',
  });
  assert.equal(calls.length, 1);
  const f = ics(calls[0]);
  assert.match(f, /METHOD:CANCEL/);
  assert.match(f, /UID:event-9-expert@sagenest\.org/);
  assert.match(calls[0].htmlContent, /Attendees notified/);
});
