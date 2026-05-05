const prisma = require('../prisma/client');

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// Parse "YYYY-MM-DD" as a UTC midnight Date
function parseUTCDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// POST /blockouts — create block-outs for a date range (date_from to date_to, inclusive)
async function createBlockout(req, res) {
  const { date_from, date_to, start_time, end_time } = req.body;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'date_from and date_to are required' });
  }

  if ((start_time && !end_time) || (!start_time && end_time)) {
    return res.status(400).json({ error: 'Both start_time and end_time are required for a time-slot block' });
  }
  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ error: 'end_time must be after start_time' });
  }

  const fromDate = parseUTCDate(date_from);
  const toDate   = parseUTCDate(date_to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format — use YYYY-MM-DD' });
  }
  if (fromDate > toDate) {
    return res.status(400).json({ error: 'date_from must be on or before date_to' });
  }

  const dayCount = Math.round((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > 90) {
    return res.status(400).json({ error: 'Date range cannot exceed 90 days' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const isFullDay = !start_time;
    const created = [];
    let removedCount = 0;
    let skipped = 0;

    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const dateForDay = new Date(cursor);

      const existing = await prisma.availabilityBlock.findMany({
        where: { expert_id, date: dateForDay },
      });

      const hasFullDay   = existing.some((b) => !b.start_time);
      const hasTimeSlots = existing.some((b) => !!b.start_time);

      if (isFullDay) {
        if (hasFullDay) {
          // Already a full-day block — skip silently
          skipped++;
        } else {
          // Auto-remove any time-slot blocks superseded by this full-day block
          if (hasTimeSlots) {
            await prisma.availabilityBlock.deleteMany({
              where: { expert_id, date: dateForDay, start_time: { not: null } },
            });
            removedCount += existing.filter((b) => !!b.start_time).length;
          }
          const blockout = await prisma.availabilityBlock.create({
            data: { expert_id, date: dateForDay, start_time: null, end_time: null },
          });
          created.push(blockout);
        }
      } else {
        // Time-slot block
        if (hasFullDay) {
          skipped++;
        } else {
          const dayOfWeek = dateForDay.getUTCDay();
          const dayAvailability = await prisma.availability.findFirst({
            where: { expert_id, day_of_week: dayOfWeek },
          });
          if (!dayAvailability) {
            skipped++;
          } else {
            const [newStart, newEnd] = [start_time, end_time].map((t) => {
              const [h, m] = t.split(':').map(Number);
              return h * 60 + m;
            });
            const hasOverlap = existing.some((b) => {
              if (!b.start_time) return false;
              const [bh, bm] = b.start_time.split(':').map(Number);
              const [eh, em] = b.end_time.split(':').map(Number);
              return newStart < (eh * 60 + em) && newEnd > (bh * 60 + bm);
            });

            if (hasOverlap) {
              skipped++;
            } else {
              const blockout = await prisma.availabilityBlock.create({
                data: { expert_id, date: dateForDay, start_time, end_time },
              });
              created.push(blockout);
            }
          }
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return res.status(201).json({ blockouts: created, removedCount, skipped });
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
