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

// Public-site labels for each delivery format.
const SERVICE_FORMAT_LABELS = {
  ONLINE:     'Online',
  IN_PERSON:  'In-Person',
  HOME_VISIT: 'Home Visit',
};

// ServiceCluster enum → Webflow Services Categories item name (must match exactly, case-insensitive).
// Verified live against the actual Webflow collection — FOR_PARENTS and PACKAGE previously
// pointed at stale names ('service for the mum' / 'service for the package') that no longer
// matched anything after the category items were renamed in Webflow, so every service in
// those two clusters silently never got a category assigned (resolveSingleRefId finds no
// match → field just omitted, no error). EVENT has no corresponding item in Webflow at all
// currently — that one needs a category item created there before it can ever resolve.
const CLUSTER_DISPLAY = {
  FOR_PARENTS: 'service for the parents',
  FOR_BABY:    'service for the baby',
  FOR_FAMILY:  'service for the family',
  PACKAGE:     'package',
  GIFT:        'gift cards',
  EVENT:       'event',
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

class WebflowApiError extends Error {
  constructor(message, status, body, retryAfterMs) {
    super(message);
    this.name         = 'WebflowApiError';
    this.status       = status;
    this.body         = body;
    this.retryAfterMs = retryAfterMs ?? null;
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
    // Webflow sends Retry-After (seconds) on 429s — honor it instead of guessing, so a real
    // rate-limit backs off exactly as long as Webflow asks rather than hammering it again.
    const retryAfterHeader = res.status === 429 ? res.headers.get('retry-after') : null;
    const retryAfterMs     = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    throw new WebflowApiError(`Webflow ${method} ${path} → ${res.status}: ${msg}`, res.status, errData, retryAfterMs);
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
      if (!isLastTry) await sleep(Math.max(RETRY_DELAYS_MS[attempt - 1], err.retryAfterMs || 0));
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

// ─── Site locale cache ─────────────────────────────────────────────────────────
// Localization config essentially never changes at runtime — fetched once per
// process lifetime and cached. `undefined` = not yet fetched, `null` = fetch
// failed or the site isn't localized with both EN and IT, in which case callers
// fall back to plain single-locale sync (unchanged pre-localization behavior).
let _localeCmsIds;

async function getLocaleCmsIds() {
  if (_localeCmsIds !== undefined) return _localeCmsIds;
  if (!SITE_ID) { _localeCmsIds = null; return null; }

  try {
    const site = await webflowRequest('GET', `/sites/${SITE_ID}`);
    const all  = [site.locales?.primary, ...(site.locales?.secondary || [])].filter(Boolean);
    const find = (prefix) => all.find(l => (l.tag || '').toLowerCase().startsWith(prefix))?.cmsLocaleId || null;
    const en = find('en');
    const it = find('it');
    _localeCmsIds = (en && it) ? { EN: en, IT: it } : null;
    if (!_localeCmsIds) console.warn('[Webflow] Site is not localized with both EN and IT — falling back to single-locale sync');
  } catch (err) {
    console.error('[Webflow] Failed to fetch site locales:', err.message);
    _localeCmsIds = null;
  }
  return _localeCmsIds;
}

function normalizeLabel(s) {
  return (s || '').toLowerCase().trim();
}

// Returns a Webflow item ID for the given name, creating the item if it doesn't exist.
// Used for data-driven collections (Languages, Locations, Certifications) where the set
// of values is determined by expert profiles, not by editorial decision.
//
// On a localized site, creation must go through the same bulk multi-locale path used for
// Experts/Services (see createItemAcrossLocales) — a reference item created single-locale
// here would hit the identical "can't add a locale to an existing item later" wall, quietly
// reproducing the exact backlog of un-localized items Aleksandra is currently fixing by hand.
async function upsertCollectionItem(collectionId, name) {
  if (!name) return null;
  const items = await fetchCollectionItems(collectionId);
  const found = items.find(item => normalizeLabel(item.fieldData?.name) === normalizeLabel(name));
  if (found) return found.id;

  const slug    = slugify(name);
  const locales = await getLocaleCmsIds().catch(() => null);
  let itemId;

  if (locales) {
    const cmsLocaleIds = Object.values(locales);
    itemId = await createItemAcrossLocales(collectionId, slug, cmsLocaleIds, { name, slug }, false);
    await publishItems(collectionId, [itemId], cmsLocaleIds);
  } else {
    const created = await webflowRequest('POST', `/collections/${collectionId}/items`, {
      fieldData:  { name, slug },
      isArchived: false,
      isDraft:    false,
    });
    itemId = created.id;
    await publishItems(collectionId, [itemId]);
  }

  _colCache.delete(collectionId); // bust cache so next lookup sees the new item
  console.log(`[Webflow] Auto-created "${name}" in collection ${collectionId} → ${itemId}`);
  return itemId;
}

// Multi-value version of upsertCollectionItem. Sequential, not Promise.all — a single expert
// can list several languages/certifications, and firing them all at once compounds with the
// concurrent batches in webflowSyncAll to burst well past Webflow's rate limit.
async function upsertMultiRefIds(collectionId, names) {
  if (!names || names.length === 0) return null;
  const resolved = [];
  for (const n of names) {
    const id = await upsertCollectionItem(collectionId, n).catch(err => {
      console.error(`[Webflow] Could not upsert "${n}" in ${collectionId}:`, err.message);
      return null;
    });
    resolved.push(id);
  }
  const ids = resolved.filter(Boolean);
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

// The app lives on a different subdomain (portal.sagenest.org) from the Webflow
// marketing site (www.sagenest.org), so cross-origin navigation between them only
// carries the referrer's origin under the browser's default Referrer-Policy — the
// /it/ path prefix Webflow uses for the Italian locale never survives the hop. The
// app's ?lang= detection (src/i18n/index.js) is what Book Now links must rely on
// instead, so every locale variant's booking-url needs its own matching lang param.
function withLangParam(url, localeKey) {
  return `${url}&lang=${localeKey.toLowerCase()}`;
}

// Collapses line breaks (and any whitespace hugging them) into a single space.
// Webflow's single-line PlainText fields reject line breaks outright, so text
// destined for one must be flattened first. Handles \r\n, \r and \n, and leaves
// text without breaks completely unchanged.
function flattenForSingleLine(text) {
  if (!text) return text;
  return text.replace(/[ \t]*(?:\r\n|\r|\n)+[ \t]*/g, ' ').trim();
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

  // Online (Reference → Online Experts collection — "Yes" for online-capable, "No" otherwise)
  // Allow-list rather than "not IN_PERSON": HOME_VISIT is delivered at the
  // parent's address and must publish as "No", which a negated check would
  // have silently got wrong.
  // Caught rather than left to throw (like the multi-ref lookups below already are via
  // upsertMultiRefIds) — a transient failure resolving one reference field (e.g. a
  // just-deleted item's slug still under Webflow's reuse cooldown) must not crash the
  // entire sync; the field is just omitted this round and retried on the next sync.
  if (ONLINE_COL_ID && expert.session_format) {
    const onlineCapable = ['ONLINE', 'BOTH'].includes(expert.session_format);
    const onlineName = onlineCapable ? 'Yes' : 'No';
    const id = await resolveSingleRefId(ONLINE_COL_ID, onlineName).catch(err => {
      console.error(`[Webflow] Could not resolve online status "${onlineName}":`, err.message);
      return null;
    });
    if (id) fields['online-2'] = id;
  }

  // Languages (Multi-reference → Language Experts collection — auto-creates missing languages)
  if (expert.languages?.length) {
    const ids = await upsertMultiRefIds(LANGUAGES_COL_ID, expert.languages);
    if (ids) fields['languages'] = ids;
  }

  // Location (Reference → Locations Experts collection — auto-creates missing cities)
  if (expert.address_city) {
    const id = await upsertCollectionItem(LOCATIONS_COL_ID, expert.address_city).catch(err => {
      console.error(`[Webflow] Could not upsert location "${expert.address_city}":`, err.message);
      return null;
    });
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

  // Webflow's `description` field is configured as single-line PlainText, so any
  // line break is rejected with a 400 Validation Error and the whole service
  // silently fails to sync. Collapse breaks (and the whitespace around them) to a
  // single space so multi-paragraph descriptions still publish. The original text
  // is left untouched in our database, so the portal and emails keep their
  // paragraphs — only the Webflow copy is flattened.
  if (service.description)      fields['description'] = flattenForSingleLine(service.description);
  if (service.duration_minutes) fields['duration']    = formatDuration(service.duration_minutes);
  // Lookup rather than a two-way ternary so a new mode can never fall through
  // to the wrong label. NOTE: the Webflow 'format' field must accept
  // "Home Visit" — if it is an option/select field there, the option needs
  // adding on the Webflow side before home-visit services will sync.
  if (service.format)           fields['format']      = SERVICE_FORMAT_LABELS[service.format] || service.format;
  if (expertWebflowItemId)      fields['expert']      = expertWebflowItemId;

  // Postal codes / areas covered for a Home Visit service. Always set (not just
  // when truthy) so switching a service away from HOME_VISIT clears any stale
  // areas left over in Webflow from a previous format.
  fields['postal-code-area'] = (service.format === 'HOME_VISIT' && service.home_visit_areas?.length)
    ? service.home_visit_areas.join(', ')
    : '';

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

// `cmsLocaleIds`, when given, scopes the publish to specific locale variants of each item —
// this must use the nested `items: [{ id, cmsLocaleIds }]` shape; the flat `itemIds` shape
// always targets the primary locale regardless of any other field alongside it (confirmed
// live: passing cmsLocaleIds alongside flat itemIds is silently ignored and publishes
// primary only, which looks identical to "publishing forces primary live" but isn't — this
// is the fix for that).
async function publishItems(collectionId, itemIds, cmsLocaleIds) {
  const body = cmsLocaleIds
    ? { items: itemIds.map(id => ({ id, cmsLocaleIds })) }
    : { itemIds };
  await webflowRequest('POST', `/collections/${collectionId}/items/publish`, body);
}

// Full site publish — required after archive/delete so collection pages are regenerated on the live site.
// Item-level publish only updates field data; removing an item from the live site needs a site rebuild.
async function publishSite() {
  if (!SITE_ID) { console.warn('[Webflow] WEBFLOW_SITE_ID not set — skipping site publish'); return; }
  await webflowRequest('POST', `/sites/${SITE_ID}/publish`, { publishToWebflowSubdomain: true });
  console.log('[Webflow] Site published');
}

// Creates a brand-new item across every given locale in a single call. Required for any
// item that doesn't exist yet on a localized site: Webflow's API can add locale content to
// an item ONLY at creation time — an item created without a locale can never gain that
// locale later via the API (confirmed against Webflow's docs and live-tested against the
// real site; retrofitting an existing item requires manually adding the locale in the
// Designer's CMS panel first). All variants share one item id; regardless of locale count,
// `items[0].id` is that id.
//
// Defaults to a draft placeholder (name=slug, isDraft:true) for Expert/Service items, whose
// real per-locale fieldData/isDraft is applied by the upsertWebflowItem PATCH loop that
// follows. Reference-collection items (see upsertCollectionItem) instead pass their real
// fieldData and isDraft:false directly, since they have no per-locale draft/live distinction.
async function createItemAcrossLocales(collectionId, slug, cmsLocaleIds, fieldData, isDraft = true) {
  const created = await webflowRequest('POST', `/collections/${collectionId}/items/bulk`, {
    cmsLocaleIds,
    fieldData:  fieldData || { name: slug, slug },
    isArchived: false,
    isDraft,
  });
  return created.items?.[0]?.id || null;
}

// Create-or-update a single Webflow item, guarded against duplicate creation on retry
// (see findItemBySlug). Always re-evaluates `existingItemId` fresh on every call, so a
// retry after a partial failure (e.g. create succeeded, publish didn't) resolves the
// already-created item by slug instead of POSTing again.
//
// `cmsLocaleId` targets a specific locale's content on a localized site (omit for plain
// single-locale sync). `isDraft: true` writes that locale's content but never publishes
// it — the item stays visible in the Webflow CMS for translation without going live.
async function upsertWebflowItem(collectionId, existingItemId, slug, fieldData, { cmsLocaleId, isDraft = false } = {}) {
  let itemId = existingItemId;

  if (!itemId) {
    itemId = await findItemBySlug(collectionId, slug);
  }

  const body = {
    fieldData, isArchived: false, isDraft,
    ...(cmsLocaleId ? { cmsLocaleId } : {}),
  };

  if (itemId) {
    try {
      await webflowRequest('PATCH', `/collections/${collectionId}/items/${itemId}`, body);
    } catch (err) {
      // Stored item ID no longer exists on Webflow's side (deleted out-of-band) — without
      // this, a stale ID would 404 forever on every retry/cron sweep since it never falls
      // back to re-resolving by slug. Re-resolve once, then fall through to create if gone.
      if (err.status !== 404) throw err;
      itemId = await findItemBySlug(collectionId, slug);
      if (itemId) {
        try {
          await webflowRequest('PATCH', `/collections/${collectionId}/items/${itemId}`, body);
        } catch (err2) {
          // The base item still resolves by slug (just confirmed above), so this second
          // 404 is scoped to the locale, not the item — its locale record was deleted
          // out-of-band (e.g. someone in Webflow removed the Italian draft instead of
          // re-editing it) rather than the whole item going missing. That's a state we
          // can't fix from here (the API can't recreate a locale on an existing item —
          // see createItemAcrossLocales above), so skip it quietly instead of
          // retrying/dead-lettering/alerting on every future sync of this item.
          if (cmsLocaleId && err2.status === 404) {
            console.warn(`[Webflow] No ${cmsLocaleId} locale record for item ${itemId} in collection ${collectionId} — skipping (locale record missing, likely deleted in Webflow)`);
            return itemId;
          }
          throw err2;
        }
      }
    }
  }

  if (!itemId) {
    const created = await webflowRequest('POST', `/collections/${collectionId}/items`, body);
    itemId = created.id;
  }

  // A draft variant must never be published — publishing is what makes a locale's
  // content go live, and a draft is exactly the "present but not published" state.
  if (!isDraft) {
    await publishItems(collectionId, [itemId], cmsLocaleId ? [cmsLocaleId] : undefined);
  }
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
      user:           { select: { name: true, language: true } },
      services:       { orderBy: { sort_order: 'asc' } },
      certifications: { select: { name: true } },
    },
  });
  if (!expert) return;

  const slug          = expert.webflow_slug || expertSlug(expert.user.name, expert.id);
  const fieldData     = await buildExpertFields(expert, slug);
  const activeLocale  = expert.user.language === 'it' ? 'IT' : 'EN';
  const locales       = await getLocaleCmsIds().catch(() => null);

  try {
    let itemId = expert.webflow_item_id;

    if (!locales) {
      // Site isn't localized (or locale lookup failed) — plain single-locale sync,
      // unchanged from pre-localization behavior.
      const localeFieldData = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], activeLocale) };
      itemId = await syncWithRetry(
        () => upsertWebflowItem(EXPERTS_COLLECTION_ID, itemId, slug, localeFieldData),
        { entityType: 'expert', entityId: expertId, payload: localeFieldData },
      );
    } else {
      // Brand-new item: must be created across both locales in one call, or it can never
      // gain the second locale later (see createItemAcrossLocales). Only applies the first
      // time — once itemId exists, every future sync just PATCHes each locale below.
      let isNewItem = false;
      if (!itemId) {
        itemId = await findItemBySlug(EXPERTS_COLLECTION_ID, slug);
      }
      if (!itemId) {
        isNewItem = true;
        itemId = await syncWithRetry(
          () => createItemAcrossLocales(EXPERTS_COLLECTION_ID, slug, Object.values(locales)),
          {
            entityType:     'expert',
            entityId:       expertId,
            payload:        { action: 'create-localized', slug },
            idempotencyKey: `expert:${expertId}:create`,
          },
        );
      }

      if (isNewItem) {
        // Brand-new item: publish live in the expert's own language, and push the
        // same content into the other locale as a draft so it exists in the CMS for
        // translation but never shows on the public site (client requirement:
        // profiles must publish only in the expert's own language). This locale
        // loop runs ONLY here, at creation — see the else-branch below.
        for (const localeKey of ['EN', 'IT']) {
          const cmsLocaleId = locales[localeKey];
          if (!cmsLocaleId) continue;
          const localeFieldData = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], localeKey) };
          itemId = await syncWithRetry(
            () => upsertWebflowItem(EXPERTS_COLLECTION_ID, itemId, slug, localeFieldData, {
              cmsLocaleId,
              isDraft: localeKey !== activeLocale,
            }),
            {
              entityType:     'expert',
              entityId:       expertId,
              payload:        localeFieldData,
              idempotencyKey: `expert:${expertId}:${localeKey}`,
            },
          );
        }
      } else {
        // Item already exists: touch ONLY its own (active) locale from here on. The
        // other locale may since have been manually translated directly in Webflow —
        // re-writing it here would silently overwrite that translation with
        // source-language content (this is what happened to Ludovica's IT profile).
        // Leave it alone permanently once the item has been created.
        const cmsLocaleId       = locales[activeLocale];
        const localeFieldData   = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], activeLocale) };
        itemId = await syncWithRetry(
          () => upsertWebflowItem(EXPERTS_COLLECTION_ID, itemId, slug, localeFieldData, {
            cmsLocaleId,
            isDraft: false,
          }),
          {
            entityType:     'expert',
            entityId:       expertId,
            payload:        localeFieldData,
            idempotencyKey: `expert:${expertId}:${activeLocale}`,
          },
        );
      }
    }

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
    include: {
      services: { where: { is_active: true }, orderBy: { sort_order: 'asc' } },
      user:     { select: { language: true } },
    },
  });
  if (!expert?.webflow_item_id) return;

  for (const svc of expert.services) {
    await syncService(svc.id, expert.id, expert.webflow_item_id, expert.user.language).catch(() => {});
  }
}

// Sync a single service (can be called with overrides to avoid extra DB lookups).
// `expertLanguageOverride` mirrors the expert's registered language so the service
// publishes live in that locale too — falls back to a fresh lookup when omitted.
async function syncService(serviceId, expertIdOverride, expertWebflowItemIdOverride, expertLanguageOverride) {
  if (!SERVICES_COLLECTION_ID) return;

  const service = await prisma.service.findUnique({
    where:   { id: serviceId },
    include: { expert: { select: { id: true, webflow_item_id: true, user: { select: { language: true } } } } },
  });
  if (!service) return;

  const expertId            = expertIdOverride            ?? service.expert_id;
  const expertWebflowItemId = expertWebflowItemIdOverride ?? service.expert?.webflow_item_id;
  if (!expertWebflowItemId) return; // expert not yet synced — retry job will catch it

  const activeLocale = (expertLanguageOverride ?? service.expert?.user?.language) === 'it' ? 'IT' : 'EN';
  const fieldData     = await buildServiceFields(service, expertId, expertWebflowItemId);
  const locales       = await getLocaleCmsIds().catch(() => null);

  try {
    let itemId = service.webflow_item_id;

    if (!locales) {
      const localeFieldData = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], activeLocale) };
      itemId = await syncWithRetry(
        () => upsertWebflowItem(SERVICES_COLLECTION_ID, itemId, fieldData.slug, localeFieldData),
        { entityType: 'service', entityId: serviceId, payload: localeFieldData },
      );
    } else {
      // Brand-new item: must be created across both locales in one call, or it can never
      // gain the second locale later (see createItemAcrossLocales).
      let isNewItem = false;
      if (!itemId) {
        itemId = await findItemBySlug(SERVICES_COLLECTION_ID, fieldData.slug);
      }
      if (!itemId) {
        isNewItem = true;
        itemId = await syncWithRetry(
          () => createItemAcrossLocales(SERVICES_COLLECTION_ID, fieldData.slug, Object.values(locales)),
          {
            entityType:     'service',
            entityId:       serviceId,
            payload:        { action: 'create-localized', slug: fieldData.slug },
            idempotencyKey: `service:${serviceId}:create`,
          },
        );
      }

      if (isNewItem) {
        // Locale loop runs ONLY at creation — see the else-branch below for every
        // later sync of an item that already exists.
        for (const localeKey of ['EN', 'IT']) {
          const cmsLocaleId = locales[localeKey];
          if (!cmsLocaleId) continue;
          const localeFieldData = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], localeKey) };
          itemId = await syncWithRetry(
            () => upsertWebflowItem(SERVICES_COLLECTION_ID, itemId, fieldData.slug, localeFieldData, {
              cmsLocaleId,
              isDraft: localeKey !== activeLocale,
            }),
            {
              entityType:     'service',
              entityId:       serviceId,
              payload:        localeFieldData,
              idempotencyKey: `service:${serviceId}:${localeKey}`,
            },
          );
        }
      } else {
        // Item already exists: touch ONLY its own (active) locale from here on — the
        // other locale may since have been manually translated directly in Webflow,
        // and re-writing it here would silently overwrite that translation with
        // source-language content. Leave it alone permanently once created.
        const cmsLocaleId     = locales[activeLocale];
        const localeFieldData = { ...fieldData, 'booking-url': withLangParam(fieldData['booking-url'], activeLocale) };
        itemId = await syncWithRetry(
          () => upsertWebflowItem(SERVICES_COLLECTION_ID, itemId, fieldData.slug, localeFieldData, {
            cmsLocaleId,
            isDraft: false,
          }),
          {
            entityType:     'service',
            entityId:       serviceId,
            payload:        localeFieldData,
            idempotencyKey: `service:${serviceId}:${activeLocale}`,
          },
        );
      }
    }

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

// A 404 on the archive-PATCH or DELETE step means a prior (partially-failed) attempt
// already deleted the item on Webflow's side — treat as done rather than retrying forever.
// Also covers a locale variant that never existed (e.g. a pre-existing item whose secondary
// locale was never manually added in the Designer) — there's nothing live there to hide.
async function ignoreIfAlreadyGone(fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

// Archives (hides) an item across every configured locale. Locale variants are fully
// independent — archiving only the primary locale leaves any other locale's published
// content live and publicly visible (confirmed live: hiding one locale does not hide
// another). Omit `locales` for plain single-locale sync.
async function archiveItemAcrossLocales(collectionId, itemId, locales) {
  const localeIds = locales ? Object.values(locales) : [undefined];
  for (const cmsLocaleId of localeIds) {
    // Both steps tolerate 404 the same way: if the item/locale is already gone (e.g. a
    // retry after a prior attempt's delete step already succeeded), there's nothing left
    // to archive or publish — without this, a retry storms forever on an already-deleted item.
    await ignoreIfAlreadyGone(() => webflowRequest('PATCH', `/collections/${collectionId}/items/${itemId}`, {
      isArchived: true, isDraft: false,
      ...(cmsLocaleId ? { cmsLocaleId } : {}),
    }));
    await ignoreIfAlreadyGone(() => publishItems(collectionId, [itemId], cmsLocaleId ? [cmsLocaleId] : undefined));
  }
}

// Deletes an item across every configured locale. A plain unscoped DELETE only removes the
// primary locale's variant (confirmed live) — any secondary locale's content survives, fully
// intact and still live, unless deleted with its own `cmsLocaleId` query param. GDPR erasure
// depends on this being complete across every locale, not just the primary one.
async function deleteItemAcrossLocales(collectionId, itemId, locales) {
  const localeIds = locales ? Object.values(locales) : [undefined];
  for (const cmsLocaleId of localeIds) {
    await ignoreIfAlreadyGone(() => webflowRequest(
      'DELETE',
      `/collections/${collectionId}/items/${itemId}${cmsLocaleId ? `?cmsLocaleId=${cmsLocaleId}` : ''}`,
    ));
  }
}

// ─── Archive (hide without deleting) — used for suspend ───────────────────────

async function archiveExpert(expertId) {
  if (!EXPERTS_COLLECTION_ID) return;
  const expert = await prisma.expert.findUnique({ where: { id: expertId } });
  if (!expert?.webflow_item_id) return;

  const locales = await getLocaleCmsIds().catch(() => null);

  try {
    await syncWithRetry(
      async () => {
        await archiveItemAcrossLocales(EXPERTS_COLLECTION_ID, expert.webflow_item_id, locales);
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

async function deleteExpertFromWebflow(expertId, webflowItemId) {
  if (!webflowItemId || !EXPERTS_COLLECTION_ID) return;
  const locales = await getLocaleCmsIds().catch(() => null);

  // Delete all synced services first
  if (SERVICES_COLLECTION_ID) {
    const services = await prisma.service.findMany({
      where:  { expert_id: expertId, webflow_item_id: { not: null } },
      select: { id: true, webflow_item_id: true },
    });
    for (const svc of services) {
      try {
        await syncWithRetry(
          async () => {
            await archiveItemAcrossLocales(SERVICES_COLLECTION_ID, svc.webflow_item_id, locales);
            await deleteItemAcrossLocales(SERVICES_COLLECTION_ID, svc.webflow_item_id, locales);
          },
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
        await archiveItemAcrossLocales(EXPERTS_COLLECTION_ID, webflowItemId, locales);
        await deleteItemAcrossLocales(EXPERTS_COLLECTION_ID, webflowItemId, locales);
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
  const locales = await getLocaleCmsIds().catch(() => null);

  try {
    await syncWithRetry(
      async () => {
        // Archive first so the live site hides the item on publish, then hard-delete from CMS
        await archiveItemAcrossLocales(SERVICES_COLLECTION_ID, webflowItemId, locales);
        await deleteItemAcrossLocales(SERVICES_COLLECTION_ID, webflowItemId, locales);
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

// Dead-letter retry dispatch: a failure row's payload.action tells us what operation to
// replay. "delete" failures target entities that are gone from Postgres by design (GDPR
// erasure deletes the row before the fire-and-forget Webflow call even runs), so retrying
// must replay from the stored webflowItemId rather than re-fetching — syncExpert/syncService
// would just find no row and silently no-op. "archive" failures (suspend) must replay the
// archive too, not a plain sync — a plain sync would re-publish (un-hide) a suspended expert.
async function retryDeadLetter(failure) {
  const { entity_type: entityType, entity_id: entityId, payload } = failure;

  if (payload?.action === 'delete') {
    return entityType === 'expert'
      ? deleteExpertFromWebflow(entityId, payload.webflowItemId)
      : deleteServiceFromWebflow(entityId, payload.webflowItemId);
  }

  if (payload?.action === 'archive' && entityType === 'expert') {
    return archiveExpert(entityId);
  }

  return entityType === 'expert' ? syncExpert(entityId) : syncService(entityId);
}

module.exports = {
  syncExpert,
  syncExpertServices,
  syncService,
  archiveExpert,
  deleteExpertFromWebflow,
  deleteServiceFromWebflow,
  retryDeadLetter,
  sleep,
  // Exported for scripts (e.g. resetAndResyncWebflowExpert.js) that need to pre-check for
  // leftover items under the same slug before clearing/resyncing — must match the sync
  // logic's own slug generation exactly, so re-exported rather than duplicated.
  expertSlug,
  serviceSlug,
};
