// ─── Convert a calendar date + local time in an IANA timezone to UTC ────────
// e.g. zonedToUTC(2026, 3, 31, 9, 0, 'Europe/Berlin') → 2026-03-31T07:00:00Z
function zonedToUTC(year, month, day, hours, minutes, timezone) {
  // Treat inputs as UTC to get a starting guess
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));

  // Find what that UTC instant looks like in the target timezone
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(guess).forEach(({ type, value }) => {
    parts[type] = parseInt(value, 10);
  });

  const zonedHour   = parts.hour === 24 ? 0 : (parts.hour || 0);
  const diffMinutes = (hours * 60 + minutes) - (zonedHour * 60 + (parts.minute || 0));
  return new Date(guess.getTime() + diffMinutes * 60 * 1000);
}

// ─── Parse a plain "YYYY-MM-DDTHH:mm" wall-clock string (no timezone info) ──
// Used wherever a client sends a local date/time that must be interpreted
// against a specific IANA zone server-side (e.g. the expert's registered
// timezone), rather than trusting the browser's own local time.
function parseWallClockDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

module.exports = { zonedToUTC, parseWallClockDateTime };
