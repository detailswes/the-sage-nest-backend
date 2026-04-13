const prisma = require('../prisma/client');

const VALID_FORMATS  = ['ONLINE', 'IN_PERSON'];
const VALID_CLUSTERS = ['FOR_MUM', 'FOR_BABY', 'PACKAGE', 'GIFT'];

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

async function createService(req, res) {
  const { title, description, duration_minutes, price, format, cluster } = req.body;

  if (!title || !description || !duration_minutes || !price || !format || !cluster) {
    return res.status(400).json({ error: 'title, description, duration_minutes, price, format, and cluster are required.' });
  }
  if (title.trim().length > 80) {
    return res.status(400).json({ error: 'Service title must be 80 characters or fewer.' });
  }
  if (description && description.trim().length > 300) {
    return res.status(400).json({ error: 'Description must be 300 characters or fewer.' });
  }
  const dur = parseInt(duration_minutes);
  if (isNaN(dur) || dur < 15 || dur > 480) {
    return res.status(400).json({ error: 'Duration must be between 15 and 480 minutes.' });
  }
  const priceVal = parseFloat(price);
  if (isNaN(priceVal) || priceVal < 1.00) {
    return res.status(400).json({ error: 'Price must be at least €1.00.' });
  }
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be ONLINE or IN_PERSON.' });
  }
  if (!VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_MUM, FOR_BABY, PACKAGE, or GIFT.' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    // Place new service at the end of the expert's current list
    const maxOrderResult = await prisma.service.aggregate({
      where: { expert_id },
      _max: { sort_order: true },
    });
    const sort_order = (maxOrderResult._max.sort_order ?? -1) + 1;

    const service = await prisma.service.create({
      data: {
        expert_id,
        title: title.trim(),
        description: description?.trim() || null,
        duration_minutes: parseInt(duration_minutes),
        price: parseFloat(price),
        format: format || null,
        cluster: cluster || null,
        is_active: false,
        sort_order,
      },
    });
    return res.status(201).json(service);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function listServices(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const services = await prisma.service.findMany({
      where: { expert_id },
      orderBy: { sort_order: 'asc' },
    });
    return res.json(services);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateService(req, res) {
  const { id } = req.params;
  const { title, description, duration_minutes, price, is_active, format, cluster } = req.body;

  if (title !== undefined && title.trim().length > 80) {
    return res.status(400).json({ error: 'Service title must be 80 characters or fewer.' });
  }
  if (description !== undefined && description && description.trim().length > 300) {
    return res.status(400).json({ error: 'Description must be 300 characters or fewer.' });
  }
  if (duration_minutes !== undefined) {
    const dur = parseInt(duration_minutes);
    if (isNaN(dur) || dur < 15 || dur > 480) {
      return res.status(400).json({ error: 'Duration must be between 15 and 480 minutes.' });
    }
  }
  if (price !== undefined) {
    const priceVal = parseFloat(price);
    if (isNaN(priceVal) || priceVal < 1.00) {
      return res.status(400).json({ error: 'Price must be at least €1.00.' });
    }
  }
  if (format !== undefined && format !== null && format !== '' && !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be ONLINE or IN_PERSON.' });
  }
  if (cluster !== undefined && cluster !== null && cluster !== '' && !VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_MUM, FOR_BABY, PACKAGE, or GIFT.' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const service = await prisma.service.findUnique({ where: { id: parseInt(id) } });
    if (!service || service.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const updated = await prisma.service.update({
      where: { id: parseInt(id) },
      data: {
        ...(title !== undefined        && { title: title.trim() }),
        ...(description !== undefined  && { description: description?.trim() || null }),
        ...(duration_minutes !== undefined && { duration_minutes: parseInt(duration_minutes) }),
        ...(price !== undefined        && { price: parseFloat(price) }),
        ...(is_active !== undefined    && { is_active }),
        ...(format !== undefined       && { format: format || null }),
        ...(cluster !== undefined      && { cluster: cluster || null }),
      },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function deleteService(req, res) {
  const { id } = req.params;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const service = await prisma.service.findUnique({ where: { id: parseInt(id) } });
    if (!service || service.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await prisma.service.delete({ where: { id: parseInt(id) } });
    return res.json({ message: 'Service deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function reorderServices(req, res) {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    // Verify every ID in the list belongs to this expert
    const owned = await prisma.service.findMany({
      where: { expert_id, id: { in: ids } },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return res.status(403).json({ error: 'One or more services not found' });
    }

    // Assign sort_order = position in the submitted array
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.service.update({
          where: { id },
          data: { sort_order: index },
        })
      )
    );

    return res.json({ message: 'Services reordered' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createService, listServices, updateService, deleteService, reorderServices };
