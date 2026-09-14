const prisma = require('../prisma/client');
const webflowService = require('../services/webflow.service');
const { PRICE_LIMITS } = require('../constants/currency');
const { SERVICE_FORMATS } = require('../constants/format');
const { countryKeyFromIso, sanitizeHomeVisitAreas } = require('../constants/homeVisitAreas');
const { logAudit } = require('../utils/auditLog');

const VALID_FORMATS    = SERVICE_FORMATS;
const VALID_CLUSTERS   = ['FOR_PARENTS', 'FOR_BABY', 'FOR_FAMILY', 'PACKAGE', 'GIFT', 'EVENT'];

// Areas an expert covers for a HOME_VISIT service are picked from a fixed
// region → province/landsdel/county dataset scoped to their practice-address
// country (see constants/homeVisitAreas.js). Home visit is only offered where
// that dataset exists — currently Italy, Denmark, and the United Kingdom.
const HOME_VISIT_COUNTRY_ERROR =
  'Home visit services are only available for experts whose practice address is in Italy, Denmark, or the United Kingdom.';
const HOME_VISIT_AREAS_ERROR =
  'Select at least one region and province you cover for home visit services.';

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
  const { title, description, duration_minutes, price, format, cluster, home_visit_areas } = req.body;

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
    return res.status(400).json({ error: `Invalid format. Must be one of ${VALID_FORMATS.join(', ')}.` });
  }
  if (!VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_PARENTS, FOR_BABY, FOR_FAMILY, PACKAGE, GIFT, or EVENT.' });
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    const expert_id = expert.id;

    let sanitizedAreas = [];
    if (format === 'HOME_VISIT') {
      const countryKey = countryKeyFromIso(expert.address_country);
      if (!countryKey) {
        return res.status(400).json({ error: HOME_VISIT_COUNTRY_ERROR });
      }
      sanitizedAreas = sanitizeHomeVisitAreas(home_visit_areas, countryKey);
      if (sanitizedAreas.length === 0) {
        return res.status(400).json({ error: HOME_VISIT_AREAS_ERROR });
      }
    }

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
        home_visit_areas: sanitizedAreas,
        cluster: cluster || null,
        is_active: false,
        sort_order,
        review_status: 'PENDING_REVIEW',
        submitted_at: new Date(),
      },
    });
    // A brand-new service is always pending admin review — there's no live
    // version yet, so the row itself is the reviewable item.
    return res.status(201).json({ service, pending: true });
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
      include: { draft: true },
    });
    return res.json(services);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function updateService(req, res) {
  const { id } = req.params;
  const { title, description, duration_minutes, price, currency, is_active, format, cluster, home_visit_areas } = req.body;

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
    return res.status(400).json({ error: `Invalid format. Must be one of ${VALID_FORMATS.join(', ')}.` });
  }
  if (cluster !== undefined && cluster !== null && cluster !== '' && !VALID_CLUSTERS.includes(cluster)) {
    return res.status(400).json({ error: 'Invalid cluster. Must be FOR_PARENTS, FOR_BABY, FOR_FAMILY, PACKAGE, GIFT, or EVENT.' });
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { user_id: req.user.id } });
    if (!expert) return res.status(404).json({ error: 'Expert profile not found' });
    const expert_id = expert.id;

    const service = await prisma.service.findUnique({ where: { id: parseInt(id) }, include: { draft: true } });
    if (!service || service.expert_id !== expert_id) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Home visit areas are only meaningful while the service's (possibly
    // just-updated) format is HOME_VISIT — required and re-sanitized against
    // whichever areas apply (new ones from this request, or the existing
    // ones if this update doesn't touch them). Switching away from
    // HOME_VISIT clears them so a later switch back doesn't resurrect a
    // stale, no-longer-reviewed list.
    const effectiveFormat = format !== undefined ? (format || null) : service.format;
    let sanitizedAreas;
    if (effectiveFormat === 'HOME_VISIT') {
      // Only (re)validate the area list when this request actually touches it
      // (or the format). A partial update that leaves both alone — an
      // is_active toggle, a price edit — must not trip over a legacy
      // free-text list that predates the region/province picker.
      if (home_visit_areas !== undefined || format !== undefined) {
        const countryKey = countryKeyFromIso(expert.address_country);
        if (!countryKey) {
          return res.status(400).json({ error: HOME_VISIT_COUNTRY_ERROR });
        }
        // Legacy free-text areas won't survive sanitisation — the expert has
        // to re-pick them from the dropdowns when they next edit the service.
        const sourceAreas = home_visit_areas !== undefined ? home_visit_areas : service.home_visit_areas;
        sanitizedAreas = sanitizeHomeVisitAreas(sourceAreas, countryKey);
        if (sanitizedAreas.length === 0) {
          return res.status(400).json({ error: HOME_VISIT_AREAS_ERROR });
        }
      }
    } else if (home_visit_areas !== undefined || (format !== undefined && service.home_visit_areas.length > 0)) {
      sanitizedAreas = [];
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
    // "unpublished after a Stripe currency change, not yet reconfirmed" —
    // AND once an admin has approved it at least once.
    if (is_active === true && service.review_status !== 'APPROVED') {
      return res.status(400).json({
        error: 'This service must be approved by an admin before it can be activated.',
      });
    }
    if (is_active === true && (!expert.currency || effectiveCurrency !== expert.currency)) {
      logCurrencyRejection(req.user.id, service.id, effectiveCurrency, expert.currency);
      return res.status(400).json({
        error: expert.currency
          ? `This service is priced in ${effectiveCurrency}, but your account currency is ${expert.currency}. Update its currency and price before publishing.`
          : 'Your Stripe payout currency isn\'t confirmed yet — finish connecting Stripe before publishing services.',
      });
    }

    // Content fields go through admin review; operational fields (is_active,
    // and a forced currency realignment together with its paired price) stay
    // instant regardless of review state — see the branching below.
    const contentData = {
      ...(title !== undefined        && { title: title.trim() }),
      ...(description !== undefined  && { description: description?.trim() || null }),
      ...(duration_minutes !== undefined && { duration_minutes: parseInt(duration_minutes) }),
      ...(price !== undefined && !isRealignment && { price: parseFloat(price) }),
      ...(format !== undefined       && { format: format || null }),
      ...(sanitizedAreas !== undefined && { home_visit_areas: sanitizedAreas }),
      ...(cluster !== undefined      && { cluster: cluster || null }),
    };
    const hasContentFields = Object.keys(contentData).length > 0;
    const operationalData = {
      ...(currency !== undefined     && { currency }),
      ...(isRealignment && price !== undefined && { price: parseFloat(price) }),
      ...(is_active !== undefined    && { is_active }),
    };

    let updated;
    let serviceDraft = null;
    let pending = false;

    if (service.review_status !== 'APPROVED') {
      // Never-yet-approved, or previously rejected: there's no live version
      // to protect, so content edits land straight on the row itself. Any
      // real content change resubmits it for review.
      const hasChange = Object.entries(contentData).some(([key, value]) => {
        if (key === 'home_visit_areas') return JSON.stringify(value) !== JSON.stringify(service.home_visit_areas);
        if (key === 'price') return value !== Number(service.price);
        return value !== service[key];
      });
      updated = await prisma.service.update({
        where: { id: parseInt(id) },
        data: {
          ...contentData,
          ...operationalData,
          ...(hasChange && {
            review_status: 'PENDING_REVIEW',
            submitted_at: new Date(),
            reviewed_at: null,
            rejection_note: null,
          }),
        },
      });
      pending = hasChange;
      if (hasChange) {
        logAudit(req.user.id, 'SERVICE_SUBMITTED_FOR_REVIEW', 'SERVICE', service.id);
      }
    } else if (!hasContentFields) {
      // Pure operational update (toggle / currency realignment) on an
      // already-approved service — instant, as before.
      updated = await prisma.service.update({
        where: { id: parseInt(id) },
        data: operationalData,
      });
    } else {
      // Approved service, content edit: stage it as a draft. The live row —
      // what parents/booking see — is untouched until an admin approves it;
      // operational fields in the same request still apply live.
      if (Object.keys(operationalData).length > 0) {
        updated = await prisma.service.update({ where: { id: parseInt(id) }, data: operationalData });
      } else {
        updated = service;
      }
      // The draft always holds a *complete* proposed row — fields this
      // request doesn't touch fall back to the current draft (if one's
      // already pending) or the live service, so a partial edit never
      // appears to blank out the untouched fields for the admin's diff.
      const draftBaseline = service.draft
        ? {
            title: service.draft.title,
            description: service.draft.description,
            duration_minutes: service.draft.duration_minutes,
            price: service.draft.price !== null ? Number(service.draft.price) : null,
            format: service.draft.format,
            cluster: service.draft.cluster,
            home_visit_areas: service.draft.home_visit_areas,
          }
        : {
            title: service.title,
            description: service.description,
            duration_minutes: service.duration_minutes,
            price: Number(service.price),
            format: service.format,
            cluster: service.cluster,
            home_visit_areas: service.home_visit_areas,
          };
      const proposedContent = { ...draftBaseline, ...contentData };
      serviceDraft = await prisma.serviceDraft.upsert({
        where: { service_id: service.id },
        create: { service_id: service.id, ...proposedContent },
        update: {
          ...proposedContent,
          status: 'PENDING_REVIEW',
          submitted_at: new Date(),
          reviewed_at: null,
          rejection_note: null,
        },
      });
      pending = true;
      logAudit(req.user.id, 'SERVICE_SUBMITTED_FOR_REVIEW', 'SERVICE', service.id);
    }

    // Fire-and-forget Webflow sync — only for services on APPROVED experts,
    // and only reflects the live row (content edits pending in a draft don't
    // sync until approved).
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

    return res.json({ service: updated, ...(serviceDraft && { service_draft: serviceDraft }), pending });
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
