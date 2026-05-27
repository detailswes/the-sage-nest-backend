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

// ─── Helper: UTC date → { timeStr "HH:MM", dayOfWeek 0–6 } in a given timezone
function getZonedParts(date, timezone) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).forEach(({ type, value }) => { parts[type] = value; });

  const h = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
  const m = parseInt(parts.minute, 10);
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[parts.weekday] ?? date.getDay();
  return { timeStr, dayOfWeek };
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
    const now = new Date();
    const [existingBookings, activeLocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          expert_id: expert.id,
          scheduled_at: { gte: dayStart, lt: dayEnd },
          status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        },
        select: { scheduled_at: true, duration_minutes: true },
      }),
      prisma.slotLock.findMany({
        where: {
          expert_id: expert.id,
          slot_start: { gte: dayStart, lt: dayEnd },
          expires_at: { gt: now },
        },
        select: { slot_start: true },
      }),
    ]);
    const lockedSlotMs = new Set(activeLocks.map((l) => l.slot_start.getTime()));

    // ── Generate candidate slots ─────────────────────────────────────────────

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

        // Skip slots held by an active lock from another parent
        if (lockedSlotMs.has(slotStart.getTime())) { cursor += durationMinutes; continue; }

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

  const TIME_RE = /^\d{2}:\d{2}$/;
  if (!TIME_RE.test(start_time) || !TIME_RE.test(end_time)) {
    return res.status(400).json({ error: 'Times must be in HH:MM format' });
  }

  const MIN_TIME = '06:00';
  const MAX_TIME = '22:00';
  if (start_time < MIN_TIME || start_time >= MAX_TIME) {
    return res.status(400).json({ error: 'Start time must be between 06:00 and 21:59' });
  }
  if (end_time <= MIN_TIME || end_time > MAX_TIME) {
    return res.status(400).json({ error: 'End time must be between 06:01 and 22:00' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ error: 'End time must be after start time' });
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

    const dayInt = parseInt(day_of_week);
    const existing = await prisma.availability.findMany({
      where: { expert_id: expert.id, day_of_week: dayInt },
    });
    const conflict = existing.find(
      (s) => start_time < s.end_time && end_time > s.start_time
    );
    if (conflict) {
      return res.status(409).json({
        error: `This slot overlaps with an existing slot on that day: ${conflict.start_time}–${conflict.end_time}`,
      });
    }

    const availability = await prisma.availability.create({
      data: { expert_id: expert.id, day_of_week: dayInt, start_time, end_time },
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

// ─── GET /availability/:id/conflicts — bookings affected by removing a slot ───
async function getAvailabilityConflicts(req, res) {
  const { id } = req.params;

  try {
    const expert = await prisma.expert.findUnique({
      where: { user_id: req.user.id },
      select: { id: true, timezone: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });

    const slot = await prisma.availability.findUnique({ where: { id: parseInt(id) } });
    if (!slot || slot.expert_id !== expert.id) {
      return res.status(404).json({ error: 'Availability slot not found' });
    }

    const tz = expert.timezone || 'UTC';

    const bookings = await prisma.booking.findMany({
      where: {
        expert_id: expert.id,
        scheduled_at: { gt: new Date() },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      },
      select: {
        id: true,
        scheduled_at: true,
        duration_minutes: true,
        status: true,
        parent: { select: { name: true } },
        service: { select: { title: true } },
      },
      orderBy: { scheduled_at: 'asc' },
    });

    const conflicts = bookings.filter((bk) => {
      const { timeStr, dayOfWeek } = getZonedParts(bk.scheduled_at, tz);
      return (
        dayOfWeek === slot.day_of_week &&
        timeStr >= slot.start_time &&
        timeStr < slot.end_time
      );
    });

    return res.json({ bookings: conflicts });
  } catch (err) {
    console.error('[getAvailabilityConflicts]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /availability/available-dates — which days in a month have ≥1 slot ───
//
// Query params: expertId (required), year (required), month (required, 1-12),
//               serviceId (optional — uses service duration for slot-fit check)
//
// Returns: { available_dates: ["YYYY-MM-DD", ...] }
// All DB round-trips are batched to ~5 queries total regardless of month length.
//
async function getAvailableDatesInMonth(req, res) {
  const { expertId, serviceId, year, month } = req.query;
  const y = parseInt(year);
  const m = parseInt(month);

  if (!expertId || !y || !m || m < 1 || m > 12) {
    return res.status(400).json({ error: 'expertId, year, and month are required' });
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

    let durationMinutes = 60;
    if (serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
      if (svc && svc.expert_id === expert.id) durationMinutes = svc.duration_minutes;
    }

    // All availability rules for this expert, grouped by day-of-week
    const allRules = await prisma.availability.findMany({ where: { expert_id: expert.id } });
    const rulesByDow = {};
    for (const rule of allRules) {
      if (!rulesByDow[rule.day_of_week]) rulesByDow[rule.day_of_week] = [];
      rulesByDow[rule.day_of_week].push(rule);
    }

    // Fetch all blockouts and bookings for the month in a single query each.
    // Pad the UTC range by ±1 day to handle European UTC+ offset (local midnight ≠ UTC midnight).
    const rangeStart = new Date(Date.UTC(y, m - 1, 0));           // last day of prev month
    const rangeEnd   = new Date(Date.UTC(y, m, 2));               // 2nd day of next month
    const [blockouts, existingBookings] = await Promise.all([
      prisma.availabilityBlock.findMany({
        where: { expert_id: expert.id, date: { gte: rangeStart, lt: rangeEnd } },
      }),
      prisma.booking.findMany({
        where: {
          expert_id: expert.id,
          scheduled_at: { gte: rangeStart, lt: rangeEnd },
          status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        },
        select: { scheduled_at: true, duration_minutes: true },
      }),
    ]);

    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    const maxBookingDate = new Date(todayUTC);
    maxBookingDate.setDate(maxBookingDate.getDate() + advanceBookingDays);
    const now = new Date();

    const daysInMonth    = new Date(y, m, 0).getDate();
    const availableDates = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const targetDateUTC = new Date(Date.UTC(y, m - 1, d));

      // Skip past and out-of-window dates
      if (targetDateUTC < todayUTC || targetDateUTC > maxBookingDate) continue;

      // Skip days with no availability rule
      const dow      = new Date(y, m - 1, d).getDay();
      const dayRules = rulesByDow[dow];
      if (!dayRules || dayRules.length === 0) continue;

      // UTC window for this calendar day in the expert's timezone
      const dayStart = zonedToUTC(y, m, d, 0, 0, tz);
      const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayBlockouts = blockouts.filter((b) => b.date >= dayStart && b.date < dayEnd);
      if (dayBlockouts.some((b) => b.start_time === null)) continue; // full-day blockout

      const dayBookings = existingBookings.filter(
        (bk) => bk.scheduled_at >= dayStart && bk.scheduled_at < dayEnd,
      );

      // Early-exit slot search — stop as soon as one valid slot is found
      let found = false;
      outer: for (const rule of dayRules) {
        const availStart = timeToMinutes(rule.start_time);
        const availEnd   = timeToMinutes(rule.end_time);
        let cursor = availStart;
        while (cursor + durationMinutes <= availEnd) {
          const slotEndMins = cursor + durationMinutes;
          const slotStart   = zonedToUTC(y, m, d, Math.floor(cursor / 60),      cursor % 60,      tz);
          const slotEnd     = zonedToUTC(y, m, d, Math.floor(slotEndMins / 60), slotEndMins % 60, tz);

          if (slotStart.getTime() - now.getTime() < noticeMs) { cursor += durationMinutes; continue; }

          const blockedByBlockout = dayBlockouts.some((b) => {
            if (!b.start_time) return false;
            const bS = timeToMinutes(b.start_time), bE = timeToMinutes(b.end_time);
            return cursor < bE && slotEndMins > bS;
          });
          if (blockedByBlockout) { cursor += durationMinutes; continue; }

          const blockedByBooking = dayBookings.some((bk) => {
            const bkS = bk.scheduled_at.getTime();
            const bkE = bkS + (bk.duration_minutes + bufferMinutes) * 60 * 1000;
            return slotStart.getTime() < bkE && slotEnd.getTime() > bkS;
          });
          if (blockedByBooking) { cursor += durationMinutes; continue; }

          found = true;
          break outer;
        }
      }

      if (found) {
        availableDates.push(
          `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        );
      }
    }

    return res.json({ available_dates: availableDates });
  } catch (err) {
    console.error('[getAvailableDatesInMonth]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

const SLOT_LOCK_MINUTES = 10;

// ─── POST /availability/lock-slot ────────────────────────────────────────────
// Atomically reserves a slot for the requesting parent for SLOT_LOCK_MINUTES.
// @@unique([expert_id, slot_start]) means concurrent inserts → one P2002 → 409.
async function lockSlot(req, res) {
  const { expertId, slotStart } = req.body;
  if (!expertId || !slotStart) {
    return res.status(400).json({ error: 'expertId and slotStart are required' });
  }
  const slotStartDate = new Date(slotStart);
  if (isNaN(slotStartDate.getTime())) {
    return res.status(400).json({ error: 'slotStart must be a valid ISO datetime' });
  }

  const expertIdInt = parseInt(expertId);
  const now         = new Date();
  const expiresAt   = new Date(now.getTime() + SLOT_LOCK_MINUTES * 60 * 1000);

  try {
    // Release any existing lock this parent holds for this expert (slot change)
    await prisma.slotLock.deleteMany({
      where: { expert_id: expertIdInt, parent_id: req.user.id },
    });

    const lock = await prisma.slotLock.create({
      data: { expert_id: expertIdInt, slot_start: slotStartDate, parent_id: req.user.id, expires_at: expiresAt },
    });
    return res.status(201).json({ lockId: lock.id, expiresAt: lock.expires_at });
  } catch (err) {
    if (err.code === 'P2002') {
      // A lock exists — check if it's expired and we can claim it
      const existing = await prisma.slotLock.findUnique({
        where: { expert_id_slot_start: { expert_id: expertIdInt, slot_start: slotStartDate } },
      });
      if (existing && existing.expires_at <= now) {
        try {
          await prisma.slotLock.delete({ where: { id: existing.id } });
          const lock = await prisma.slotLock.create({
            data: { expert_id: expertIdInt, slot_start: slotStartDate, parent_id: req.user.id, expires_at: expiresAt },
          });
          return res.status(201).json({ lockId: lock.id, expiresAt: lock.expires_at });
        } catch (_) {
          // Race: another request claimed the expired slot first
        }
      }
      return res.status(409).json({ error: 'This slot is currently reserved. Please select a different time.' });
    }
    console.error('[lockSlot]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /availability/lock-slot/:lockId ───────────────────────────────────
// Releases a slot lock. Called on: slot change, page exit, payment failure.
async function releaseLock(req, res) {
  const { lockId } = req.params;
  try {
    const lock = await prisma.slotLock.findUnique({ where: { id: parseInt(lockId) } });
    if (!lock || lock.parent_id !== req.user.id) {
      return res.status(404).json({ error: 'Lock not found' });
    }
    await prisma.slotLock.delete({ where: { id: parseInt(lockId) } });
    return res.json({ message: 'Slot released' });
  } catch (err) {
    console.error('[releaseLock]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { addAvailability, listAvailability, removeAvailability, getAvailableSlots, getAvailabilityConflicts, getAvailableDatesInMonth, lockSlot, releaseLock };
