const prisma = require('../prisma/client');

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// ─── Helper: parse "HH:MM" to minutes from midnight ──────────────────────────
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// ─── Helper: minutes from midnight → "HH:MM" ─────────────────────────────────
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Helper: convert a calendar date + local time in an IANA timezone to UTC ─
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

// ─── GET /availability/slots — public slot generation ────────────────────────
//
// Query params: expertId (required), date (YYYY-MM-DD, required), serviceId (optional)
//
// Algorithm:
//   1. Get expert's weekly availability rules for the given day-of-week
//   2. Remove full-day blockouts
//   3. Generate slot start times (step = service.duration_minutes, default 60)
//   4. Remove slots overlapping time-range blockouts
//   5. Remove slots overlapping existing CONFIRMED or PENDING_PAYMENT bookings
//   6. Remove slots in the past (with 30-min buffer)
//
async function getAvailableSlots(req, res) {
  const { expertId, date, serviceId } = req.query;

  if (!expertId || !date) {
    return res.status(400).json({ error: 'expertId and date are required' });
  }

  // Parse and validate date (interpret as UTC midnight)
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const targetDateUTC = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(targetDateUTC.getTime())) {
    return res.status(400).json({ error: 'Invalid date' });
  }

  // Reject past dates
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  if (targetDateUTC < todayUTC) {
    return res.json([]);
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(expertId) },
      select: { id: true, timezone: true, buffer_minutes: true, advance_booking_days: true, min_notice_hours: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    const tz                 = expert.timezone             || 'UTC';
    const bufferMinutes      = expert.buffer_minutes       || 0;
    const advanceBookingDays = expert.advance_booking_days || 60;
    const noticeMs           = (expert.min_notice_hours ?? 24) * 60 * 60 * 1000;

    // Reject dates beyond the expert's advance booking window
    const maxBookingDate = new Date();
    maxBookingDate.setUTCHours(0, 0, 0, 0);
    maxBookingDate.setDate(maxBookingDate.getDate() + advanceBookingDays);
    if (targetDateUTC > maxBookingDate) return res.json([]);

    // ── Service duration ─────────────────────────────────────────────────────
    let durationMinutes = 60;
    if (serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
      if (svc && svc.expert_id === expert.id) durationMinutes = svc.duration_minutes;
    }

    // ── Day of week from the calendar date (not UTC midnight) ────────────────
    // Using new Date(y, m-1, d) avoids timezone-induced day shifts for European offsets
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const rules = await prisma.availability.findMany({
      where: { expert_id: expert.id, day_of_week: dayOfWeek },
    });
    if (rules.length === 0) return res.json([]);

    // ── UTC boundaries for this calendar date in the expert's timezone ───────
    const dayStart = zonedToUTC(year, month, day, 0, 0, tz);
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const blockouts = await prisma.availabilityBlock.findMany({
      where: {
        expert_id: expert.id,
        date: { gte: dayStart, lt: dayEnd },
      },
    });

    // Full-day blockout → no slots
    if (blockouts.some((b) => b.start_time === null)) return res.json([]);

    // ── Existing bookings for this date ──────────────────────────────────────
    const existingBookings = await prisma.booking.findMany({
      where: {
        expert_id: expert.id,
        scheduled_at: { gte: dayStart, lt: dayEnd },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      },
      select: { scheduled_at: true, duration_minutes: true },
    });

    // ── Generate candidate slots ─────────────────────────────────────────────
    const now = new Date();

    const slots = [];

    for (const rule of rules) {
      const availStart = timeToMinutes(rule.start_time);
      const availEnd   = timeToMinutes(rule.end_time);

      let cursor = availStart;
      while (cursor + durationMinutes <= availEnd) {
        const slotEndMinutes = cursor + durationMinutes;

        // Build slot datetime by converting expert's local time to UTC
        const slotStart = zonedToUTC(year, month, day, Math.floor(cursor / 60), cursor % 60, tz);
        const slotEnd   = zonedToUTC(year, month, day, Math.floor(slotEndMinutes / 60), slotEndMinutes % 60, tz);

        // Skip slots within the expert's minimum notice period
        if (slotStart.getTime() - now.getTime() < noticeMs) {
          cursor += durationMinutes;
          continue;
        }

        // Skip slots blocked by time-range blockouts
        const blockedByBlockout = blockouts.some((b) => {
          if (!b.start_time) return false; // full-day already handled above
          const bStart = timeToMinutes(b.start_time);
          const bEnd   = timeToMinutes(b.end_time);
          // Overlap: slot starts before blockout ends AND slot ends after blockout starts
          return cursor < bEnd && slotEndMinutes > bStart;
        });
        if (blockedByBlockout) { cursor += durationMinutes; continue; }

        // Skip slots overlapping existing bookings (+ expert's buffer after each booking)
        const blockedByBooking = existingBookings.some((bk) => {
          const bkStart = bk.scheduled_at.getTime();
          const bkEnd   = bkStart + (bk.duration_minutes + bufferMinutes) * 60 * 1000;
          return slotStart.getTime() < bkEnd && slotEnd.getTime() > bkStart;
        });
        if (blockedByBooking) { cursor += durationMinutes; continue; }

        slots.push({
          start:     slotStart.toISOString(),
          end:       slotEnd.toISOString(),
          timeLabel: minutesToTime(cursor),
        });

        cursor += durationMinutes;
      }
    }

    // Sort chronologically (multiple rules on same day could be out of order)
    slots.sort((a, b) => a.start.localeCompare(b.start));

    return res.json(slots);
  } catch (err) {
    console.error('[getAvailableSlots]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function addAvailability(req, res) {
  const { day_of_week, start_time, end_time } = req.body;

  if (day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'day_of_week, start_time, and end_time are required' });
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { user_id: req.user.id },
      select: { id: true, timezone: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    if (!expert.timezone) {
      return res.status(400).json({ error: 'Please set your timezone in your profile before adding availability.' });
    }

    const availability = await prisma.availability.create({
      data: { expert_id: expert.id, day_of_week: parseInt(day_of_week), start_time, end_time },
    });
    return res.status(201).json(availability);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listAvailability(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const slots = await prisma.availability.findMany({
      where: { expert_id },
      orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    });
    return res.json(slots);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function removeAvailability(req, res) {
  const { id } = req.params;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const slot = await prisma.availability.findUnique({ where: { id: parseInt(id) } });
    if (!slot || slot.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Availability slot not found' });
    }

    await prisma.availability.delete({ where: { id: parseInt(id) } });
    return res.json({ message: 'Availability slot removed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { addAvailability, listAvailability, removeAvailability, getAvailableSlots };
