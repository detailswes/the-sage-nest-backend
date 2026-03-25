const prisma = require('../prisma/client');

const VALID_FORMATS  = ['ONLINE', 'IN_PERSON'];
const VALID_CLUSTERS = ['FOR_MUM', 'FOR_BABY', 'PACKAGE', 'GIFT'];

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

async function createService(req, res) {
  const { title, description, duration_minutes, price, format, cluster } = req.body;

  if (!title || !duration_minutes || !price) {
    return res.status(400).json({ error: 'title, duration_minutes, and price are required.' });
  }
  if (format && !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be ONLINE or IN_PERSON.' });
  }
  if (cluster && !VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_MUM, FOR_BABY, PACKAGE, or GIFT.' });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id) return res.status(404).json({ error: 'Expert profile not found' });

    const service = await prisma.service.create({
      data: {
        expert_id,
        title: title.trim(),
        description: description?.trim() || null,
        duration_minutes: parseInt(duration_minutes),
        price: parseFloat(price),
        format: format || null,
        cluster: cluster || null,
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
      orderBy: { id: 'asc' },
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

module.exports = { createService, listServices, updateService, deleteService };
