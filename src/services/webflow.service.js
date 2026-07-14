const prisma = require('../prisma/client');
const { sendWebflowSyncFailureAlert } = require('../utils/email');

const WEBFLOW_API_BASE      = 'https://api.webflow.com/v2';
const EXPERTS_COLLECTION_ID  = process.env.WEBFLOW_EXPERTS_COLLECTION_ID;
const SERVICES_COLLECTION_ID = process.env.WEBFLOW_SERVICES_COLLECTION_ID;
const SITE_ID                = process.env.WEBFLOW_SITE_ID;
const APP_URL                = process.env.APP_URL || 'https://portal.sagenest.org';

// Reference collection IDs
const ONLINE_COL_ID         = process.env.WEBFLOW_ONLINE_COLLECTION_ID;
const LANGUAGES_COL_ID      = process.env.WEBFLOW_LANGUAGES_COLLECTION_ID;
const LOCATIONS_COL_ID      = process.env.WEBFLOW_LOCATIONS_COLLECTION_ID;
const CERTIFICATIONS_COL_ID = process.env.WEBFLOW_CERTIFICATIONS_COLLECTION_ID;
const CATEGORIES_COL_ID     = process.env.WEBFLOW_CATEGORIES_COLLECTION_ID;

// ServiceCluster enum → Webflow Services Categories item name (must match exactly, case-insensitive)
const CLUSTER_DISPLAY = {
  FOR_PARENTS: 'service for the mum',
  FOR_BABY:    'service for the baby',
  FOR_FAMILY:  'service for the family',
  PACKAGE:     'service for the package',
  GIFT:        'gift cards',
  EVENT:       'event',
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

class WebflowApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name   = 'WebflowApiError';
    this.status = status;
    this.body   = body;
  }
}

async function webflowRequest(method, path, body) {
  const res = await fetch(`${WEBFLOW_API_BASE}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      accept:         'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg     = errData.message || errData.msg || res.statusText;
    throw new WebflowApiError(`Webflow ${method} ${path} → ${res.status}: ${msg}`, res.status, errData);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Structured sync logging ───────────────────────────────────────────────────
// One JSON line per sync attempt — payload, target item, attempt number, outcome,
// timestamp. This is the single chokepoint all sync/retry/archive/delete paths log
// through, so no sync call can fail without leaving a queryable trace.

function logWebflowSync({ entityType, entityId, itemId, attempt, maxAttempts, outcome, payload, error, durationMs }) {
  const record = {
    ts:          new Date().toISOString(),
    scope:       'webflow_sync',
    entityType,
    entityId,
    itemId:      itemId ?? null,
    attempt,
    maxAttempts,
    outcome,     // 'success' | 'retrying' | 'dead_lettered'
    durationMs,
    payload,
    ...(error ? { error: error.message, httpStatus: error.status ?? null } : {}),
  };
  if (outcome === 'success') {
    console.log(`[Webflow] ${JSON.stringify(record)}`);
  } else {
    console.error(`[Webflow] ${JSON.stringify(record)}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Retry + dead-letter wrapper ───────────────────────────────────────────────
// 1 initial try + 3 retries, delayed 2s / 10s / 30s per the reliability spec.
const RETRY_DELAYS_MS = [2000, 10000, 30000];
const MAX_TRIES        = RETRY_DELAYS_MS.length + 1;

// Re-alerting on every subsequent cron sweep for the same stuck item would spam
// ops — only re-alert if the last alert for this entity is over an hour old.
const ALERT_THROTTLE_MS = 60 * 60 * 1000;

async function resolveWebflowSyncFailure(idempotencyKey) {
  await prisma.webflowSyncFailure
    .updateMany({
      where: { idempotency_key: idempotencyKey, status: 'PENDING_RETRY' },
      data:  { status: 'RESOLVED' },
    })
    .catch(err => console.error('[Webflow] Failed to resolve dead-letter row:', err.message));
}

async function deadLetterWebflowSync({ entityType, entityId, idempotencyKey, payload, error }) {
  const lastError = (error?.message || 'Unknown error').slice(0, 1000);

  let row;
  try {
    row = await prisma.webflowSyncFailure.upsert({
      where:  { idempotency_key: idempotencyKey },
      create: {
        entity_type:     entityType,
        entity_id:       entityId,
        idempotency_key: idempotencyKey,
        payload:         payload ?? {},
        last_error:      lastError,
        attempts:        MAX_TRIES,
        status:          'PENDING_RETRY',
      },
      update: {
        payload:    payload ?? {},
        last_error: lastError,
        attempts:   { increment: MAX_TRIES },
        status:     'PENDING_RETRY',
      },
    });
  } catch (err) {
    console.error('[Webflow] Failed to write dead-letter row:', err.message);
    return;
  }

  const shouldAlert = !row.alerted_at || Date.now() - row.alerted_at.getTime() > ALERT_THROTTLE_MS;
  if (!shouldAlert) return;

  await prisma.webflowSyncFailure
    .update({ where: { id: row.id }, data: { alerted_at: new Date() } })
    .catch(err => console.error('[Webflow] Failed to record alert timestamp:', err.message));

  sendWebflowSyncFailureAlert({
    entityType,
    entityId,
    lastError,
    attempts: row.attempts,
  }).catch(err => console.error('[Webflow] Failed to send dead-letter alert:', err.message));
}

// Runs `fn` up to MAX_TRIES times with backoff. On success, resolves any open
// dead-letter row for this entity. On exhausting all tries, writes/updates the
// dead-letter row, alerts (throttled), and rethrows the last error so existing
// callers' try/catch or .catch() handling is unaffected.
async function syncWithRetry(fn, { entityType, entityId, payload, idempotencyKey }) {
  const key = idempotencyKey || `${entityType}:${entityId}`;
  let lastError;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const start = Date.now();
    try {
      const result = await fn();
      logWebflowSync({
        entityType, entityId, payload,
        itemId:      typeof result === 'string' ? result : undefined,
        attempt, maxAttempts: MAX_TRIES,
        outcome:     'success',
        durationMs:  Date.now() - start,
      });
      await resolveWebflowSyncFailure(key);
      return result;
    } catch (err) {
      lastError = err;
      const isLastTry = attempt === MAX_TRIES;
      logWebflowSync({
        entityType, entityId, payload, error: err,
        attempt, maxAttempts: MAX_TRIES,
        outcome:     isLastTry ? 'dead_lettered' : 'retrying',
        durationMs:  Date.now() - start,
      });
      if (!isLastTry) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  await deadLetterWebflowSync({ entityType, entityId, idempotencyKey: key, payload, error: lastError });
  throw lastError;
}

// ─── Reference collection cache ───────────────────────────────────────────────
// Small lookup collections (3-6 items) are cached for 5 min to avoid redundant
// Webflow API calls on every expert/service sync.

const _colCache  = new Map(); // collectionId → { items, fetchedAt }
const CACHE_TTL  = 5 * 60 * 1000;

async function fetchCollectionItems(collectionId) {
  const cached = _colCache.get(collectionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.items;

  const data  = await webflowRequest('GET', `/collections/${collectionId}/items?limit=100`);
  const items = data.items || [];
  _colCache.set(collectionId, { items, fetchedAt: Date.now() });
  return items;
}

function normalizeLabel(s) {
  return (s || '').toLowerCase().trim();
}

// Returns a Webflow item ID for the given name, creating the item if it doesn't exist.
// Used for data-driven collections (Languages, Locations, Certifications) where the set
// of values is determined by expert profiles, not by editorial decision.
async function upsertCollectionItem(collectionId, name) {
  if (!name) return null;
  const items = await fetchCollectionItems(collectionId);
  const found = items.find(item => normalizeLabel(item.fieldData?.name) === normalizeLabel(name));
  if (found) return found.id;

  const created = await webflowRequest('POST', `/collections/${collectionId}/items`, {
    fieldData:  { name, slug: slugify(name) },
    isArchived: false,
    isDraft:    false,
  });
  await publishItems(collectionId, [created.id]);
  _colCache.delete(collectionId); // bust cache so next lookup sees the new item
  console.log(`[Webflow] Auto-created "${name}" in collection ${collectionId} → ${created.id}`);
  return created.id;
}

// Multi-value version of upsertCollectionItem.
async function upsertMultiRefIds(collectionId, names) {
  if (!names || names.length === 0) return null;
  const ids = (
    await Promise.all(
      names.map(n =>
        upsertCollectionItem(collectionId, n).catch(err => {
          console.error(`[Webflow] Could not upsert "${n}" in ${collectionId}:`, err.message);
          return null;
        }),
      ),
    )
  ).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

// Returns a Webflow item ID for the given name, or null if not found.
// Used for editorial collections (Services Categories) where the app must NOT create items.
async function resolveSingleRefId(collectionId, name) {
  if (!name) return null;
  const items = await fetchCollectionItems(collectionId);
  const found = items.find(item => normalizeLabel(item.fieldData?.name) === normalizeLabel(name));
  return found?.id ?? null;
}

// Idempotency guard for the main Experts/Services collections: a previous sync attempt
// may have successfully POSTed a new item to Webflow but failed (crash/timeout) before
// its ID was persisted locally. Before creating another item, search by slug — since
// expertSlug()/serviceSlug() deterministically embed the entity ID — so a retry PATCHes
// the already-created item instead of creating a duplicate. Always bypasses the reference
// cache and paginates the full collection, since these collections can exceed 100 items.
async function findItemBySlug(collectionId, slug) {
  const limit = 100;
  let offset  = 0;

  while (true) {
    const data  = await webflowRequest('GET', `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`);
    const items = data.items || [];
    const found = items.find(item => item.fieldData?.slug === slug);
    if (found) return found.id;

    const total = data.pagination?.total ?? items.length;
    offset += limit;
    if (items.length === 0 || offset >= total) return null;
  }
}

// ─── Slug + field helpers ─────────────────────────────────────────────────────

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function expertSlug(name, id)  { return `${slugify(name  || 'expert')}-${id}`; }
function serviceSlug(title, id){ return `${slugify(title || 'service')}-${id}`; }

function formatDuration(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function formatPrice(amount, currency) {
  return new Intl.NumberFormat('en', {
    style:                 'currency',
    currency:              currency || 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

async function buildExpertFields(expert, slug) {
  const activeServices = (expert.services || []).filter(s => s.is_active);
  const cheapest = activeServices.length
    ? activeServices.reduce((a, b) => Number(a.price) <= Number(b.price) ? a : b)
    : null;

  const fields = {
    name:          expert.user.name,
    slug,
    'booking-url': `${APP_URL}/book?expertId=${expert.id}`,
  };

  if (expert.position)       fields['position']          = expert.position;
  if (expert.summary)        fields['short-description'] = expert.summary;
  if (expert.bio)            fields['bio-content']       = expert.bio;
  if (cheapest)              fields['price']             = `From ${formatPrice(cheapest.price, cheapest.currency)}`;
  if (expert.instagram)      fields['instagram-url']     = expert.instagram;
  if (expert.facebook)       fields['facebook-url']      = expert.facebook;
  if (expert.linkedin)       fields['linkedin-url']      = expert.linkedin;
  if (expert.profile_image)  fields['photo']             = { url: expert.profile_image, alt: expert.user.name };

  // ── Reference fields ─────────────────────────────────────────────────────────

  // Online (Reference → Online Experts collection — "Yes" for online-capable, "No" for in-person only)
  if (ONLINE_COL_ID && expert.session_format) {
    const onlineName = expert.session_format === 'IN_PERSON' ? 'No' : 'Yes';
    const id = await resolveSingleRefId(ONLINE_COL_ID, onlineName);
    if (id) fields['online-2'] = id;
  }

  // Languages (Multi-reference → Language Experts collection — auto-creates missing languages)
  if (expert.languages?.length) {
    const ids = await upsertMultiRefIds(LANGUAGES_COL_ID, expert.languages);
    if (ids) fields['languages'] = ids;
  }

  // Location (Reference → Locations Experts collection — auto-creates missing cities)
  if (expert.address_city) {
    const id = await upsertCollectionItem(LOCATIONS_COL_ID, expert.address_city);
    if (id) fields['location'] = id;
  }

  // Certification (Multi-reference → Certification Experts collection — auto-creates missing certs)
  const certNames = (expert.certifications || []).map(c => c.name).filter(Boolean);
  if (certNames.length) {
    const ids = await upsertMultiRefIds(CERTIFICATIONS_COL_ID, certNames);
    if (ids) fields['certification-2'] = ids;
  }

  // Google Maps link — built from available address parts
  const addressParts = [expert.address_street, expert.address_city, expert.address_postcode]
    .filter(Boolean);
  if (addressParts.length) {
    fields['google-maps-link'] = `https://www.google.com/maps/search/${encodeURIComponent(addressParts.join(', '))}`;
  }

  return fields;
}

async function buildServiceFields(service, expertId, expertWebflowItemId) {
  const currency = (service.currency || 'EUR').toUpperCase();
  const formattedPrice = new Intl.NumberFormat('en', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(Number(service.price));

  const fields = {
    name:          service.title,
    slug:          serviceSlug(service.title, service.id),
    'price-new':   formattedPrice,
    'booking-url': `${APP_URL}/book?expertId=${expertId}&serviceId=${service.id}`,
  };

  if (service.description)      fields['description'] = service.description;
  if (service.duration_minutes) fields['duration']    = formatDuration(service.duration_minutes);
  if (service.format)           fields['format']      = service.format === 'ONLINE' ? 'Online' : 'In-Person';
  if (expertWebflowItemId)      fields['expert']      = expertWebflowItemId;

  // Category (Reference → Services Categories collection)
  if (service.cluster) {
    const categoryName = CLUSTER_DISPLAY[service.cluster];
    if (categoryName) {
      const id = await resolveSingleRefId(CATEGORIES_COL_ID, categoryName);
      if (id) fields['category'] = id;
    }
  }

  return fields;
}

async function publishItems(collectionId, itemIds) {
  await webflowRequest('POST', `/collections/${collectionId}/items/publish`, { itemIds });
}

// Full site publish — required after archive/delete so collection pages are regenerated on the live site.
// Item-level publish only updates field data; removing an item from the live site needs a site rebuild.
async function publishSite() {
  if (!SITE_ID) { console.warn('[Webflow] WEBFLOW_SITE_ID not set — skipping site publish'); return; }
  await webflowRequest('POST', `/sites/${SITE_ID}/publish`, { publishToWebflowSubdomain: true });
  console.log('[Webflow] Site published');
}

// Create-or-update a single Webflow item, guarded against duplicate creation on retry
// (see findItemBySlug). Always re-evaluates `existingItemId` fresh on every call, so a
// retry after a partial failure (e.g. create succeeded, publish didn't) resolves the
// already-created item by slug instead of POSTing again.
async function upsertWebflowItem(collectionId, existingItemId, slug, fieldData) {
  let itemId = existingItemId;

  if (!itemId) {
    itemId = await findItemBySlug(collectionId, slug);
  }

  if (itemId) {
    await webflowRequest('PATCH', `/collections/${collectionId}/items/${itemId}`, {
      fieldData, isArchived: false, isDraft: false,
    });
  } else {
    const created = await webflowRequest('POST', `/collections/${collectionId}/items`, {
      fieldData, isArchived: false, isDraft: false,
    });
    itemId = created.id;
  }

  await publishItems(collectionId, [itemId]);
  return itemId;
}

// ─── Expert sync ──────────────────────────────────────────────────────────────

async function syncExpert(expertId) {
  if (!EXPERTS_COLLECTION_ID) {
    console.warn('[Webflow] WEBFLOW_EXPERTS_COLLECTION_ID not set — skipping');
    return;
  }

  const expert = await prisma.expert.findUnique({
    where:   { id: expertId },
    include: {
      user:           { select: { name: true } },
      services:       { orderBy: { sort_order: 'asc' } },
      certifications: { select: { name: true } },
    },
  });
  if (!expert) return;

  const slug      = expert.webflow_slug || expertSlug(expert.user.name, expert.id);
  const fieldData = await buildExpertFields(expert, slug);

  try {
    const itemId = await syncWithRetry(
      () => upsertWebflowItem(EXPERTS_COLLECTION_ID, expert.webflow_item_id, slug, fieldData),
      { entityType: 'expert', entityId: expertId, payload: fieldData },
    );

    await prisma.expert.update({
      where: { id: expertId },
      data:  {
        webflow_item_id:     itemId,
        webflow_slug:        slug,
        webflow_sync_status: 'SYNCED',
        webflow_synced_at:   new Date(),
        webflow_sync_error:  null,
      },
    });

    console.log(`[Webflow] Expert ${expertId} synced → ${itemId}`);
    return itemId;
  } catch (err) {
    await prisma.expert.update({
      where: { id: expertId },
      data:  {
        webflow_sync_status: 'FAILED',
        webflow_sync_error:  (err.message || 'Unknown error').slice(0, 500),
      },
    });
    throw err;
  }
}

// Sync all active services for an already-synced expert
async function syncExpertServices(expertId) {
  if (!SERVICES_COLLECTION_ID) return;

  const expert = await prisma.expert.findUnique({
    where:   { id: expertId },
    include: { services: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
  });
  if (!expert?.webflow_item_id) return;

  for (const svc of expert.services) {
    await syncService(svc.id, expert.id, expert.webflow_item_id).catch(() => {});
  }
}

// Sync a single service (can be called with overrides to avoid extra DB lookups)
async function syncService(serviceId, expertIdOverride, expertWebflowItemIdOverride) {
  if (!SERVICES_COLLECTION_ID) return;

  const service = await prisma.service.findUnique({
    where:   { id: serviceId },
    include: { expert: { select: { id: true, webflow_item_id: true } } },
  });
  if (!service) return;

  const expertId            = expertIdOverride            ?? service.expert_id;
  const expertWebflowItemId = expertWebflowItemIdOverride ?? service.expert?.webflow_item_id;
  if (!expertWebflowItemId) return; // expert not yet synced — retry job will catch it

  const fieldData = await buildServiceFields(service, expertId, expertWebflowItemId);

  try {
    const itemId = await syncWithRetry(
      () => upsertWebflowItem(SERVICES_COLLECTION_ID, service.webflow_item_id, fieldData.slug, fieldData),
      { entityType: 'service', entityId: serviceId, payload: fieldData },
    );

    await prisma.service.update({
      where: { id: serviceId },
      data:  {
        webflow_item_id:     itemId,
        webflow_slug:        fieldData.slug,
        webflow_sync_status: 'SYNCED',
        webflow_synced_at:   new Date(),
        webflow_sync_error:  null,
      },
    });

    console.log(`[Webflow] Service ${serviceId} synced → ${itemId}`);
    return itemId;
  } catch (err) {
    await prisma.service.update({
      where: { id: serviceId },
      data:  {
        webflow_sync_status: 'FAILED',
        webflow_sync_error:  (err.message || 'Unknown error').slice(0, 500),
      },
    });
    throw err;
  }
}

// ─── Archive (hide without deleting) — used for suspend / unpublish ───────────

async function archiveExpert(expertId) {
  if (!EXPERTS_COLLECTION_ID) return;
  const expert = await prisma.expert.findUnique({ where: { id: expertId } });
  if (!expert?.webflow_item_id) return;

  try {
    await syncWithRetry(
      async () => {
        await webflowRequest('PATCH', `/collections/${EXPERTS_COLLECTION_ID}/items/${expert.webflow_item_id}`, {
          isArchived: true,
          isDraft:    false,
        });
        await publishItems(EXPERTS_COLLECTION_ID, [expert.webflow_item_id]);
        await publishSite();
      },
      {
        entityType:      'expert',
        entityId:        expertId,
        payload:         { action: 'archive', webflowItemId: expert.webflow_item_id },
        idempotencyKey:  `expert:${expertId}:archive`,
      },
    );
    console.log(`[Webflow] Expert ${expertId} archived`);
  } catch (err) {
    console.error(`[Webflow] Failed to archive expert ${expertId}:`, err.message);
  }
}

// ─── Delete — used for GDPR erasure ──────────────────────────────────────────

// A 404 on the archive-PATCH or DELETE step means a prior (partially-failed) attempt
// already deleted the item on Webflow's side — treat as done rather than retrying forever.
async function ignoreIfAlreadyGone(fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

async function deleteExpertFromWebflow(expertId, webflowItemId) {
  if (!webflowItemId || !EXPERTS_COLLECTION_ID) return;

  // Delete all synced services first
  if (SERVICES_COLLECTION_ID) {
    const services = await prisma.service.findMany({
      where:  { expert_id: expertId, webflow_item_id: { not: null } },
      select: { id: true, webflow_item_id: true },
    });
    for (const svc of services) {
      try {
        await syncWithRetry(
          () => ignoreIfAlreadyGone(async () => {
            await webflowRequest('PATCH', `/collections/${SERVICES_COLLECTION_ID}/items/${svc.webflow_item_id}`, {
              isArchived: true, isDraft: false,
            });
            await publishItems(SERVICES_COLLECTION_ID, [svc.webflow_item_id]);
            await webflowRequest('DELETE', `/collections/${SERVICES_COLLECTION_ID}/items/${svc.webflow_item_id}`);
          }),
          {
            entityType:     'service',
            entityId:       svc.id,
            payload:        { action: 'delete', webflowItemId: svc.webflow_item_id },
            idempotencyKey: `service:${svc.id}:delete`,
          },
        );
        console.log(`[Webflow] Service ${svc.id} deleted`);
      } catch (err) {
        console.error(`[Webflow] Failed to delete service ${svc.id}:`, err.message);
      }
    }
    // One site publish after all services are removed, before deleting the expert
    if (services.length) await publishSite().catch(() => {});
  }

  try {
    await syncWithRetry(
      async () => {
        await ignoreIfAlreadyGone(async () => {
          await webflowRequest('PATCH', `/collections/${EXPERTS_COLLECTION_ID}/items/${webflowItemId}`, {
            isArchived: true, isDraft: false,
          });
          await publishItems(EXPERTS_COLLECTION_ID, [webflowItemId]);
          await webflowRequest('DELETE', `/collections/${EXPERTS_COLLECTION_ID}/items/${webflowItemId}`);
        });
        await publishSite();
      },
      {
        entityType:     'expert',
        entityId:       expertId,
        payload:        { action: 'delete', webflowItemId },
        idempotencyKey: `expert:${expertId}:delete`,
      },
    );
    console.log(`[Webflow] Expert ${expertId} deleted`);
  } catch (err) {
    // Non-fatal — GDPR deletion must succeed regardless of Webflow state
    console.error(`[Webflow] Failed to delete expert ${expertId}:`, err.message);
  }
}

async function deleteServiceFromWebflow(serviceId, webflowItemId) {
  if (!webflowItemId || !SERVICES_COLLECTION_ID) return;
  try {
    await syncWithRetry(
      async () => {
        // Archive first so the live site hides the item on publish, then hard-delete from CMS
        await ignoreIfAlreadyGone(async () => {
          await webflowRequest('PATCH', `/collections/${SERVICES_COLLECTION_ID}/items/${webflowItemId}`, {
            isArchived: true, isDraft: false,
          });
          await publishItems(SERVICES_COLLECTION_ID, [webflowItemId]);
          await webflowRequest('DELETE', `/collections/${SERVICES_COLLECTION_ID}/items/${webflowItemId}`);
        });
        await publishSite();
      },
      {
        entityType:     'service',
        entityId:       serviceId,
        payload:        { action: 'delete', webflowItemId },
        idempotencyKey: `service:${serviceId}:delete`,
      },
    );
    console.log(`[Webflow] Service ${serviceId} deleted`);
  } catch (err) {
    console.error(`[Webflow] Failed to delete service ${serviceId}:`, err.message);
  }
}

module.exports = {
  syncExpert,
  syncExpertServices,
  syncService,
  archiveExpert,
  deleteExpertFromWebflow,
  deleteServiceFromWebflow,
};
