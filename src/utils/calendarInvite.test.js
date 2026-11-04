const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvite, nextSequence, inviteUid, toAttachment, toIcsUtc, toIcsLocal } = require('./calendarInvite');

const base = {
  method: 'REQUEST',
  uid: 'booking-42-expert@sagenest.org',
  sequence: 1,
  // 09:30 in Rome (CET, UTC+1) on 3 Nov 2026
  start: '2026-11-03T08:30:00.000Z',
  end: '2026-11-03T09:30:00.000Z',
  summary: 'Feeding coaching with Giulia Ferrari',
  organizerEmail: 'notifications@example.org',
  attendeeEmail: 'expert@example.org',
  attendeeName: 'Expert',
};

// Unfold per RFC 5545 §3.1 so assertions don't depend on line wrapping.
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, '');

test('uses UTC times and CRLF line endings', () => {
  const ics = buildInvite(base);
  assert.match(ics, /DTSTART:20261103T083000Z\r\n/);
  assert.match(ics, /DTEND:20261103T093000Z\r\n/);
  assert.ok(!/[^\r]\n/.test(ics), 'every line break must be CRLF');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
});

test('UTC stays correct across the daylight-saving change (CET → CEST)', () => {
  // 29 Mar 2026: Italy/Denmark move to summer time. 10:00 local is 08:00Z after, 09:00Z before.
  assert.equal(toIcsUtc('2026-03-28T09:00:00.000Z'), '20260328T090000Z');
  assert.equal(toIcsUtc('2026-03-30T08:00:00.000Z'), '20260330T080000Z');
});

test('REQUEST is confirmed; CANCEL is cancelled and keeps UID, higher SEQUENCE', () => {
  const req = buildInvite(base);
  const cancel = buildInvite({ ...base, method: 'CANCEL', sequence: 2 });
  assert.match(req, /METHOD:REQUEST/);
  assert.match(req, /STATUS:CONFIRMED/);
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /STATUS:CANCELLED/);
  assert.match(cancel, /SUMMARY:Cancelled: Feeding coaching/);
  assert.match(req, /UID:booking-42-expert@sagenest\.org/);
  assert.match(cancel, /UID:booking-42-expert@sagenest\.org/);
  assert.match(req, /SEQUENCE:1/);
  assert.match(cancel, /SEQUENCE:2/);
});

test('lists only the one recipient as attendee, with RSVP off', () => {
  const ics = unfold(buildInvite(base));
  assert.equal((ics.match(/^ATTENDEE/gm) || []).length, 1);
  assert.match(ics, /ATTENDEE;CN="Expert";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:expert@example\.org/);
  assert.match(ics, /ORGANIZER;CN="Sage Nest":mailto:notifications@example\.org/);
});

test('escapes text and folds long lines at 75 octets without splitting characters', () => {
  const ics = buildInvite({
    ...base,
    summary: 'Visita; a casa, città',
    description: 'Riga uno\nRiga due ' + 'àèìòù '.repeat(40),
    location: 'Via Roma 1, 00100 Roma',
  });
  const raw = ics.split('\r\n');
  for (const line of raw) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
  const flat = unfold(ics);
  assert.ok(flat.includes('SUMMARY:Visita\\; a casa\\, città'));
  assert.ok(flat.includes('DESCRIPTION:Riga uno\\nRiga due'));
  assert.ok(flat.includes('LOCATION:Via Roma 1\\, 00100 Roma'));
  assert.ok(!flat.includes('�'), 'no broken multi-byte characters');
});

test('rejects bad input', () => {
  assert.throws(() => buildInvite({ ...base, method: 'PUBLISH' }));
  assert.throws(() => buildInvite({ ...base, end: base.start }));
  assert.throws(() => buildInvite({ ...base, sequence: -1 }));
  assert.throws(() => buildInvite({ ...base, attendeeEmail: '' }));
  assert.throws(() => buildInvite({ ...base, start: 'nope' }));
});

test('helpers: uid is stable per booking+role, sequence increases, attachment is base64', () => {
  assert.equal(inviteUid(42, 'parent', 'sagenest.org'), 'booking-42-parent@sagenest.org');
  const a = nextSequence();
  assert.ok(a > 1_700_000_000 && a < 2_147_483_647);
  const ics = buildInvite(base);
  const att = toAttachment(ics);
  assert.equal(att.name, 'invite.ics');
  assert.equal(Buffer.from(att.content, 'base64').toString('utf8'), ics);
});

test('known zone: local time with TZID + VTIMEZONE, correct in winter and summer', () => {
  // 3 Nov 2026 is CET (UTC+1): 08:30Z → 09:30 local.
  const winter = unfold(buildInvite({ ...base, timezone: 'Europe/Rome' }));
  assert.match(winter, /DTSTART;TZID=Europe\/Rome:20261103T093000\r\n/);
  assert.match(winter, /DTEND;TZID=Europe\/Rome:20261103T103000\r\n/);
  assert.equal((winter.match(/BEGIN:VTIMEZONE/g) || []).length, 1);
  assert.match(winter, /TZID:Europe\/Rome\r\n/);
  assert.match(winter, /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU/);
  assert.match(winter, /RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU/);

  // 1 Jul 2026 is CEST (UTC+2): 08:00Z → 10:00 local; Copenhagen has the same rules.
  const summer = unfold(buildInvite({ ...base, timezone: 'Europe/Copenhagen', start: '2026-07-01T08:00:00.000Z', end: '2026-07-01T09:00:00.000Z' }));
  assert.match(summer, /DTSTART;TZID=Europe\/Copenhagen:20260701T100000\r\n/);
});

test('DST edges use the real offset in effect at that instant', () => {
  assert.equal(toIcsLocal('2026-03-29T00:59:00.000Z', 'Europe/Rome'), '20260329T015900'); // still CET
  assert.equal(toIcsLocal('2026-03-29T01:00:00.000Z', 'Europe/Rome'), '20260329T030000'); // jumps to CEST
  assert.equal(toIcsLocal('2026-10-25T00:59:00.000Z', 'Europe/Rome'), '20261025T025900'); // still CEST
  assert.equal(toIcsLocal('2026-10-25T01:00:00.000Z', 'Europe/Rome'), '20261025T020000'); // back to CET
});

test('unknown or missing zone falls back to UTC with no VTIMEZONE', () => {
  for (const timezone of [undefined, null, '', 'Asia/Kolkata', 'Not/AZone']) {
    const ics = buildInvite({ ...base, timezone });
    assert.match(ics, /DTSTART:20261103T083000Z\r\n/);
    assert.ok(!ics.includes('VTIMEZONE'));
  }
});

test('cancel prefix can be translated', () => {
  const ics = unfold(buildInvite({ ...base, method: 'CANCEL', cancelledLabel: 'Annullato' }));
  assert.match(ics, /SUMMARY:Annullato: Feeding coaching/);
});
