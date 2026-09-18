/**
 * Corrects the 'format' field (Online / In-Person / Home Visit) on already-published
 * Webflow Service CMS items, which was written in English into BOTH the EN and IT
 * locale variants (the sync code didn't localize this field until now — see
 * serviceFormatLabel in webflow.service.js). The EN side is already correct; only the
 * IT locale variant needs fixing. The normal sync path can't self-heal this: once an
 * item exists, syncService only ever touches its OWN active locale going forward
 * (to avoid clobbering manual translations), so an EN-language expert's Italian
 * variant is never re-written by a routine edit.
 *
 * For each locale variant this script fetches the item's CURRENT full fieldData,
 * changes only 'format' if it doesn't match the expected label for that locale, and
 * PATCHes the full fieldData back (never a partial object) so nothing else on the
 * item can be lost regardless of Webflow's merge semantics. isDraft is read and
 * preserved as-is; a re-publish is only triggered for variants that were already
 * live (isDraft:false), matching upsertWebflowItem's own behavior.
 *
 * Two modes:
 *   (no flags)   Report-only — prints every service's current EN/IT format value and
 *                what would change, without writing anything.
 *   --confirm    Actually applies the corrected 'format' value where it differs.
 *
 * Run from the backend directory:
 *   node src/scripts/backfillServiceFormatLocale.js
 *   node src/scripts/backfillServiceFormatLocale.js --confirm
 */

const path = require('path');
const fs   = require('fs');

// Webflow credentials are commented out in .env for local dev (so running the app
// locally never accidentally syncs dev data to the live site). This script needs
// them, so read the commented WEBFLOW_* lines directly and set them in-process only
// — .env on disk is never modified, and nothing here echoes the values back to the
// terminal.
const envPath = path.join(__dirname, '../../.env');
const envRaw  = fs.readFileSync(envPath, 'utf8');
for (const line of envRaw.split('\n')) {
  const m = line.match(/^#\s*(WEBFLOW_[A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
require('dotenv').config({ path: envPath });

const prisma        = require('../prisma/client');
const webflowService = require('../services/webflow.service');

const CONFIRM = process.argv.includes('--confirm');

const WEBFLOW_BASE            = 'https://api.webflow.com/v2';
const SERVICES_COLLECTION_ID  = process.env.WEBFLOW_SERVICES_COLLECTION_ID;

async function wf(method, endpoint, body) {
  const res = await fetch(`${WEBFLOW_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization:  `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      accept:         'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, ...data };
}

async function getLocaleCmsIds() {
  const site = await wf('GET', `/sites/${process.env.WEBFLOW_SITE_ID}`);
  const all  = [site.locales?.primary, ...(site.locales?.secondary || [])].filter(Boolean);
  const find = (prefix) => all.find((l) => (l.tag || '').toLowerCase().startsWith(prefix))?.cmsLocaleId || null;
  const en = find('en');
  const it = find('it');
  return en && it ? { EN: en, IT: it } : null;
}

async function main() {
  if (!process.env.WEBFLOW_API_TOKEN || !SERVICES_COLLECTION_ID || !process.env.WEBFLOW_SITE_ID) {
    console.error('Missing WEBFLOW_API_TOKEN / WEBFLOW_SERVICES_COLLECTION_ID / WEBFLOW_SITE_ID.');
    process.exit(1);
  }

  const locales = await getLocaleCmsIds();
  if (!locales) {
    console.error('Site is not localized with both EN and IT locales — nothing to backfill.');
    process.exit(1);
  }

  const services = await prisma.service.findMany({
    where:  { webflow_item_id: { not: null }, format: { not: null } },
    select: { id: true, title: true, format: true, webflow_item_id: true },
  });

  console.log(`Found ${services.length} synced service(s) with a format set.\n`);

  let changed = 0;
  let alreadyOk = 0;
  let skipped = 0;

  for (const service of services) {
    for (const [localeKey, cmsLocaleId] of Object.entries(locales)) {
      const expected = webflowService.serviceFormatLabel(service.format, localeKey);
      const item = await wf('GET', `/collections/${SERVICES_COLLECTION_ID}/items/${service.webflow_item_id}?cmsLocaleId=${cmsLocaleId}`);

      if (item.status !== 200) {
        console.log(`  service ${service.id} "${service.title}" [${localeKey}]: could not fetch (status ${item.status}) — skipping`);
        skipped++;
        continue;
      }

      const current = item.fieldData?.format;
      if (current === expected) {
        alreadyOk++;
        continue;
      }

      console.log(`  service ${service.id} "${service.title}" [${localeKey}]: "${current}" → "${expected}" (isDraft=${item.isDraft})`);
      changed++;

      if (!CONFIRM) continue;

      const mergedFieldData = { ...item.fieldData, format: expected };
      const patchRes = await wf('PATCH', `/collections/${SERVICES_COLLECTION_ID}/items/${service.webflow_item_id}`, {
        fieldData:  mergedFieldData,
        isArchived: false,
        isDraft:    item.isDraft,
        cmsLocaleId,
      });
      if (!patchRes.ok) {
        console.log(`    ⚠ PATCH failed (status ${patchRes.status}): ${patchRes.message || patchRes.msg || 'unknown error'}`);
        continue;
      }

      if (!item.isDraft) {
        const pubRes = await wf('POST', `/collections/${SERVICES_COLLECTION_ID}/items/publish`, {
          itemIds:      [service.webflow_item_id],
          cmsLocaleIds: [cmsLocaleId],
        });
        if (!pubRes.ok) {
          console.log(`    ⚠ Publish failed (status ${pubRes.status}): ${pubRes.message || pubRes.msg || 'unknown error'}`);
        }
      }
    }
  }

  console.log(`\n${CONFIRM ? 'Applied' : 'Would apply'}: ${changed}. Already correct: ${alreadyOk}. Skipped (fetch error): ${skipped}.`);
  if (!CONFIRM && changed > 0) {
    console.log('\nReport-only mode — pass --confirm to actually apply these changes:');
    console.log('  node src/scripts/backfillServiceFormatLocale.js --confirm');
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
