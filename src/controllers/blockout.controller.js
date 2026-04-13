const prisma = require('../prisma/client');

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// POST /blockouts — create a block-out (full day or specific time slot)
async function createBlockout(req, res) {
  const { date, start_time, end_time } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  // If either time is set, both must be set
  if ((start_time && !end_time) || (!start_time && end_time)) {
    return res.status(400).json({ error: 'Both start_time and end_time are required for a time-slot block' });
  }

  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ error: 'end_time must be after start_time' });
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format — use YYYY-MM-DD' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    // Fetch all existing blocks on this date for this expert
    const existing = await prisma.availabilityBlock.findMany({
      where: { expert_id, date: parsedDate },
    });

    const hasFullDay   = existing.some((b) => !b.start_time);
    const hasTimeSlots = existing.some((b) => !!b.start_time);
    const isFullDay    = !start_time;

    if (isFullDay) {
      if (hasFullDay) {
        return res.status(409).json({
          error: 'This day is already marked as a Day Off. No changes were made.',
        });
      }

      // Full Day supersedes any existing time-slot blocks — auto-remove them
      if (hasTimeSlots) {
        await prisma.availabilityBlock.deleteMany({
          where: { expert_id, date: parsedDate, start_time: { not: null } },
        });
      }
    } else {
      // Adding a time slot
      if (hasFullDay) {
        return res.status(409).json({
          error:
            'This day is already fully blocked as a Day Off. You cannot add a time slot on top of it. If you only want to block part of the day, restore the Day Off first and then add your time-slot block.',
        });
      }

      // Reject if the expert has no weekly availability for this day of the week
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = parsedDate.getDay();
      const dayAvailability = await prisma.availability.findFirst({
        where: { expert_id, day_of_week: dayOfWeek },
      });
      if (!dayAvailability) {
        const dayName = DAY_NAMES[dayOfWeek];
        return res.status(409).json({
          error: `You have no availability set for ${dayName}s, so there is nothing to block on this day. Add ${dayName} availability to your Weekly Schedule first, or use a Full Day block if you want to mark the entire day as unavailable.`,
        });
      }

      // Check for overlap with existing time-slot blocks
      const [newStart, newEnd] = [start_time, end_time].map((t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      });

      const overlapping = existing.filter((b) => {
        const [bh, bm] = b.start_time.split(':').map(Number);
        const [eh, em] = b.end_time.split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bEnd   = eh * 60 + em;
        return newStart < bEnd && newEnd > bStart;
      });

      if (overlapping.length > 0) {
        const times = overlapping
          .map((b) => `${b.start_time}–${b.end_time}`)
          .join(', ');
        return res.status(409).json({
          error: `This time slot overlaps with an existing block (${times}). Please choose a different time or remove the existing block first.`,
        });
      }
    }

    const blockout = await prisma.availabilityBlock.create({
      data: {
        expert_id,
        date: parsedDate,
        start_time: start_time || null,
        end_time:   end_time   || null,
      },
    });

    // Tell the frontend how many time-slot blocks were removed so it can
    // refresh the list and show a helpful message if needed
    const removedCount = isFullDay && hasTimeSlots ? existing.filter((b) => !!b.start_time).length : 0;

    return res.status(201).json({ ...blockout, removedCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// GET /blockouts?from=YYYY-MM-DD&to=YYYY-MM-DD
async function listBlockouts(req, res) {
  const { from, to } = req.query;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const where = { expert_id };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to)   where.date.lte = new Date(to);
    }

    const blockouts = await prisma.availabilityBlock.findMany({
      where,
      orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
    });

    return res.json(blockouts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /blockouts/:id — restore slot (removes the block-out; recurring schedule untouched)
async function deleteBlockout(req, res) {
  const { id } = req.params;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const blockout = await prisma.availabilityBlock.findUnique({ where: { id: parseInt(id) } });
    if (!blockout || blockout.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Block-out not found' });
    }

    await prisma.availabilityBlock.delete({ where: { id: parseInt(id) } });
    return res.json({ message: 'Block-out removed — recurring schedule restored' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createBlockout, listBlockouts, deleteBlockout };
