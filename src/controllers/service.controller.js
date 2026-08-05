const prisma = require('../prisma/client');
const webflowService = require('../services/webflow.service');
const { PRICE_LIMITS } = require('../constants/currency');
const { logAudit } = require('../utils/auditLog');

const VALID_FORMATS    = ['ONLINE', 'IN_PERSON'];
const VALID_CLUSTERS   = ['FOR_PARENTS', 'FOR_BABY', 'FOR_FAMILY', 'PACKAGE', 'GIFT', 'EVENT'];

async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// Logged whenever a request tries to write a currency other than the
// expert's confirmed account currency — covers both explicit picks and stale
// records slipping through an edit. Kept in the audit trail so a pattern of
// attempts (e.g. a stale client) is visible to admins.
function logCurrencyRejection(actorUserId, serviceId, attempted, expected) {
  console.error(
    `[Currency] Rejected — service=${serviceId ?? '(new)'} attempted=${attempted} expected=${expected}`
  );
  if (serviceId) {
    logAudit(actorUserId, 'SERVICE_CURRENCY_REJECTED', 'SERVICE', serviceId,
      `Attempted currency ${attempted} does not match confirmed account currency ${expected}.`);
  }
}

async function createService(req, res) {
  const { title, description, duration_minutes, price, format, cluster } = req.body;

  if (!title || !description || !duration_minutes || !price || !format || !cluster) {
    return res.status(400).json({ error: 'title, description, duration_minutes, price, format, and cluster are required.' });
  }
  if (title.trim().length > 80) {
    return res.status(400).json({ error: 'Service title must be 80 characters or fewer.' });
  }
  if (description && description.trim().length > 500) {
    return res.status(400).json({ error: 'Description must be 500 characters or fewer.' });
  }
  const dur = parseInt(duration_minutes);
  if (isNaN(dur) || dur < 15 || dur > 480) {
    return res.status(400).json({ error: 'Duration must be between 15 and 480 minutes.' });
  }
  if (!VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be ONLINE or IN_PERSON.' });
  }
  if (!VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_PARENTS, FOR_BABY, FOR_FAMILY, PACKAGE, GIFT, or EVENT.' });
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    const expert_id = expert.id;

    // Currency is never taken from the request — it's anchored to the
    // expert's confirmed Stripe account currency (see expertCurrency.service.js).
    // Until Stripe has reported one, there's no currency to price against
    // that isn't a guess, so service creation is blocked entirely.
    if (!expert.currency) {
      return res.status(400).json({
        error: 'Please finish connecting your Stripe account before adding services — we need your confirmed payout currency first.',
      });
    }
    const currency = expert.currency;

    const priceVal = parseFloat(price);
    const limits   = PRICE_LIMITS[currency] || PRICE_LIMITS.EUR;
    if (isNaN(priceVal) || priceVal < limits.min || priceVal > limits.max) {
      return res.status(400).json({ error: `Price for ${currency} must be between ${limits.min} and ${limits.max}.` });
    }

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
        price: priceVal,
        currency,
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
  const { title, description, duration_minutes, price, currency, is_active, format, cluster } = req.body;

  if (title !== undefined && title.trim().length > 80) {
    return res.status(400).json({ error: 'Service title must be 80 characters or fewer.' });
  }
  if (description !== undefined && description && description.trim().length > 500) {
    return res.status(400).json({ error: 'Description must be 500 characters or fewer.' });
  }
  if (duration_minutes !== undefined) {
    const dur = parseInt(duration_minutes);
    if (isNaN(dur) || dur < 15 || dur > 480) {
      return res.status(400).json({ error: 'Duration must be between 15 and 480 minutes.' });
    }
  }
  if (format !== undefined && format !== null && format !== '' && !VALID_FORMATS.includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Must be ONLINE or IN_PERSON.' });
  }
  if (cluster !== undefined && cluster !== null && cluster !== '' && !VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_PARENTS, FOR_BABY, FOR_FAMILY, PACKAGE, GIFT, or EVENT.' });
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    const expert_id = expert.id;

    const service = await prisma.service.findUnique({ where: { id: parseInt(id) } });
    if (!service || service.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Currency is locked to the expert's confirmed account currency. The only
    // change ever accepted is realigning a stale service onto that currency
    // (e.g. after a Stripe currency change unpublished it) — anything else,
    // including picking some other currency outright, is rejected and logged.
    const isRealignment = currency !== undefined && currency !== service.currency;
    if (currency !== undefined && currency !== expert.currency) {
      logCurrencyRejection(req.user.id, service.id, currency, expert.currency);
      return res.status(400).json({
        error: `Currency must match your confirmed account currency (${expert.currency ?? 'not yet confirmed'}) and cannot be set to anything else.`,
      });
    }
    // Realigning currency without also resubmitting the price would leave the
    // old numeric amount under a new currency label (e.g. a 500 NOK price
    // becoming a 500 EUR price) — require both together, always.
    if (isRealignment && price === undefined) {
      return res.status(400).json({
        error: 'Please also set the price when changing a service\'s currency — the amount is never carried over automatically.',
      });
    }

    const effectiveCurrency = currency !== undefined ? currency : service.currency;

    if (price !== undefined) {
      const limits   = PRICE_LIMITS[effectiveCurrency] || PRICE_LIMITS.EUR;
      const priceVal = parseFloat(price);
      if (isNaN(priceVal) || priceVal < limits.min || priceVal > limits.max) {
        return res.status(400).json({ error: `Price for ${effectiveCurrency} must be between ${limits.min} and ${limits.max}.` });
      }
    }

    // A service can only go live once its currency matches the expert's
    // confirmed account currency — covers both "never confirmed yet" and
    // "unpublished after a Stripe currency change, not yet reconfirmed".
    if (is_active === true && (!expert.currency || effectiveCurrency !== expert.currency)) {
      logCurrencyRejection(req.user.id, service.id, effectiveCurrency, expert.currency);
      return res.status(400).json({
        error: expert.currency
          ? `This service is priced in ${effectiveCurrency}, but your account currency is ${expert.currency}. Update its currency and price before publishing.`
          : 'Your Stripe payout currency isn\'t confirmed yet — finish connecting Stripe before publishing services.',
      });
    }

    const updated = await prisma.service.update({
      where: { id: parseInt(id) },
      data: {
        ...(title !== undefined        && { title: title.trim() }),
        ...(description !== undefined  && { description: description?.trim() || null }),
        ...(duration_minutes !== undefined && { duration_minutes: parseInt(duration_minutes) }),
        ...(price !== undefined        && { price: parseFloat(price) }),
        ...(currency !== undefined     && { currency }),
        ...(is_active !== undefined    && { is_active }),
        ...(format !== undefined       && { format: format || null }),
        ...(cluster !== undefined      && { cluster: cluster || null }),
      },
    });

    // Fire-and-forget Webflow sync — only for services on APPROVED experts
    (async () => {
      try {
        const expert = await prisma.expert.findUnique({
          where:  { id: expert_id },
          select: { status: true, webflow_item_id: true },
        });
        if (expert?.status !== 'APPROVED' || !expert?.webflow_item_id) return;

        if (updated.is_active) {
          await webflowService.syncService(updated.id, expert_id, expert.webflow_item_id);
        } else if (updated.webflow_item_id) {
          await webflowService.deleteServiceFromWebflow(updated.id, updated.webflow_item_id);
          await prisma.service.update({
            where: { id: updated.id },
            data:  { webflow_item_id: null, webflow_slug: null, webflow_sync_status: 'UNSYNCED' },
          });
        }
      } catch (err) {
        console.error('[Webflow] Service sync after update failed:', err.message);
      }
    })();

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

    const webflowItemId = service.webflow_item_id;
    await prisma.service.delete({ where: { id: parseInt(id) } });

    if (webflowItemId) {
      webflowService.deleteServiceFromWebflow(parseInt(id), webflowItemId)
        .catch(err => console.error('[Webflow] Service delete failed:', err.message));
    }

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
