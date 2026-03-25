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
      select: { id: true },
    });
    if (!expert) return res.status(404).json({ error: 'Expert not found' });

    // ── Service duration ─────────────────────────────────────────────────────
    let durationMinutes = 60;
    if (serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
      if (svc && svc.expert_id === expert.id) durationMinutes = svc.duration_minutes;
    }

    // ── Availability rules for this day-of-week ──────────────────────────────
    // getUTCDay(): 0=Sunday … 6=Saturday
    const dayOfWeek = targetDateUTC.getUTCDay();
    const rules = await prisma.availability.findMany({
      where: { expert_id: expert.id, day_of_week: dayOfWeek },
    });
    if (rules.length === 0) return res.json([]);

    // ── Blockouts for this date ───────────────────────────────────────────────
    const nextDayUTC = new Date(targetDateUTC);
    nextDayUTC.setUTCDate(nextDayUTC.getUTCDate() + 1);

    const blockouts = await prisma.availabilityBlock.findMany({
      where: {
        expert_id: expert.id,
        date: { gte: targetDateUTC, lt: nextDayUTC },
      },
    });

    // Full-day blockout → no slots
    if (blockouts.some((b) => b.start_time === null)) return res.json([]);

    // ── Existing bookings for this date ──────────────────────────────────────
    const existingBookings = await prisma.booking.findMany({
      where: {
        expert_id: expert.id,
        scheduled_at: { gte: targetDateUTC, lt: nextDayUTC },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      },
      select: { scheduled_at: true, duration_minutes: true },
    });

    // ── Generate candidate slots ─────────────────────────────────────────────
    const now = new Date();
    const bufferMs = 30 * 60 * 1000; // 30-min minimum advance

    const slots = [];

    for (const rule of rules) {
      const availStart = timeToMinutes(rule.start_time);
      const availEnd   = timeToMinutes(rule.end_time);

      let cursor = availStart;
      while (cursor + durationMinutes <= availEnd) {
        const slotEndMinutes = cursor + durationMinutes;

        // Build slot UTC datetime
        const slotStart = new Date(targetDateUTC);
        slotStart.setUTCHours(Math.floor(cursor / 60), cursor % 60, 0, 0);
        const slotEnd = new Date(targetDateUTC);
        slotEnd.setUTCHours(Math.floor(slotEndMinutes / 60), slotEndMinutes % 60, 0, 0);

        // Skip past slots (with advance buffer)
        if (slotStart.getTime() - now.getTime() < bufferMs) {
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

        // Skip slots overlapping existing bookings
        const blockedByBooking = existingBookings.some((bk) => {
          const bkStart = bk.scheduled_at.getTime();
          const bkEnd   = bkStart + bk.duration_minutes * 60 * 1000;
          // Overlap
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
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const availability = await prisma.availability.create({
      data: { expert_id, day_of_week: parseInt(day_of_week), start_time, end_time },
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
