// ─── Calendar invitations (.ics, RFC 5545 / iTIP RFC 5546) ───────────────────
//
// Builds the small calendar file attached to booking emails so Gmail, Apple
// Calendar and Outlook offer "Add to calendar". No Google/Microsoft account
// connection is involved — the file is just an email attachment.
//
//  • One invite per recipient, listing only that recipient as ATTENDEE, so an
//    expert, a parent and (for group events) other attendees never see each
//    other's email address.
//  • UID is stable per booking + recipient, so a later reschedule/cancel with the
//    same UID and a higher SEQUENCE updates or removes the existing event
//    instead of creating a second one.
//  • Times are written in the recipient's own time zone (TZID + a VTIMEZONE
//    block) when it's one we know — Italy and Denmark — so Gmail's invitation
//    card reads "10am – 11am (CET)" rather than "(UTC)". Any other or missing
//    zone falls back to UTC ("Z"). Either way calendar apps convert the event
//    to the viewer's own calendar time zone, and daylight saving stays correct.

const PRODID = '-//Sage Nest//Booking Calendar//EN';

const pad = (n) => String(n).padStart(2, '0');

// 2026-11-03T08:30:00.000Z → 20261103T083000Z
function toIcsUtc(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('calendarInvite: invalid date');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Zones with the standard EU daylight-saving rules (last Sunday of March/October).
// Rome and Copenhagen are the only zones the app's users are in today; anything
// else is sent in UTC rather than guessing a rule set.
const EU_ZONES = new Set(['Europe/Rome', 'Europe/Copenhagen']);

const vtimezone = (tzid) => [
  'BEGIN:VTIMEZONE',
  `TZID:${tzid}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// 2026-11-03T08:30:00.000Z in Europe/Rome → 20261103T093000 (floating local time)
function toIcsLocal(date, timeZone) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(date)).forEach(({ type, value }) => { parts[type] = value; });
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

// TEXT values: escape backslash, semicolon, comma and newlines (RFC 5545 §3.3.11).
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Parameter values (e.g. CN) may not contain control chars; quote and drop quotes.
function paramValue(value) {
  return `"${String(value ?? '').replace(/["\r\n]/g, '')}"`;
}

// Lines must be ≤ 75 octets; continuation lines start with a single space.
// Folds on UTF-8 byte length without splitting a multi-byte character.
function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75; // first line; continuation lines hold 74 chars + the leading space
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = ch;
      currentBytes = bytes;
      limit = 74;
    } else {
      current += ch;
      currentBytes += bytes;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

/**
 * @param {object} p
 * @param {'REQUEST'|'CANCEL'} p.method    REQUEST = create/update, CANCEL = remove
 * @param {string} p.uid                   stable per booking + recipient
 * @param {number} p.sequence              must increase on every update/cancel
 * @param {Date|string} p.start
 * @param {Date|string} p.end
 * @param {string} [p.timezone]            IANA zone of the recipient; UTC if unknown
 * @param {string} p.summary
 * @param {string} [p.description]
 * @param {string} [p.location]
 * @param {string} p.organizerEmail        the app's sending address
 * @param {string} [p.organizerName]
 * @param {string} [p.cancelledLabel]       prefix for the title of a CANCEL, e.g. 'Annullato'
 * @param {string} p.attendeeEmail         the single recipient
 * @param {string} [p.attendeeName]
 * @returns {string} the .ics text (CRLF line endings)
 */
function buildInvite({
  method,
  uid,
  sequence,
  start,
  end,
  summary,
  description,
  location,
  organizerEmail,
  organizerName = 'Sage Nest',
  cancelledLabel = 'Cancelled',
  timezone,
  attendeeEmail,
  attendeeName,
}) {
  if (!['REQUEST', 'CANCEL'].includes(method)) throw new Error('calendarInvite: method must be REQUEST or CANCEL');
  if (!uid) throw new Error('calendarInvite: uid is required');
  if (!organizerEmail || !attendeeEmail) throw new Error('calendarInvite: organizer and attendee email are required');
  if (!Number.isInteger(sequence) || sequence < 0) throw new Error('calendarInvite: sequence must be a non-negative integer');
  if (new Date(end) <= new Date(start)) throw new Error('calendarInvite: end must be after start');

  const cancelled = method === 'CANCEL';
  const tzid = EU_ZONES.has(timezone) ? timezone : null;
  const dt = (name, value) =>
    tzid ? `${name};TZID=${tzid}:${toIcsLocal(value, tzid)}` : `${name}:${toIcsUtc(value)}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    ...(tzid ? vtimezone(tzid) : []),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `SEQUENCE:${sequence}`,
    dt('DTSTART', start),
    dt('DTEND', end),
    `SUMMARY:${escapeText(cancelled ? `${cancelledLabel}: ${summary}` : summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    `ORGANIZER;CN=${paramValue(organizerName)}:mailto:${organizerEmail}`,
    // RSVP=FALSE: nobody monitors the organizer mailbox, so don't ask for a reply.
    `ATTENDEE;CN=${paramValue(attendeeName || attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// A strictly increasing SEQUENCE without storing a counter. Seconds since epoch
// fit the 32-bit signed range until 2038.
const nextSequence = () => Math.floor(Date.now() / 1000);

// Stable per booking + recipient role, e.g. booking-42-expert@sagenest.org.
function inviteUid(bookingId, recipient, domain) {
  return `booking-${bookingId}-${recipient}@${domain}`;
}

// Shape accepted by sendEmail({ attachments }) — Brevo's `attachment` field.
function toAttachment(ics, filename = 'invite.ics') {
  return { name: filename, content: Buffer.from(ics, 'utf8').toString('base64') };
}

module.exports = { buildInvite, nextSequence, inviteUid, toAttachment, toIcsUtc, toIcsLocal };
