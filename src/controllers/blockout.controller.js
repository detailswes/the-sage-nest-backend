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

    const blockout = await prisma.availabilityBlock.create({
      data: {
        expert_id,
        date: parsedDate,
        start_time: start_time || null,
        end_time:   end_time   || null,
      },
    });

    return res.status(201).json(blockout);
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
