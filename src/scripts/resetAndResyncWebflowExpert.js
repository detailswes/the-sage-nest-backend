/**
 * Clears an expert's stale Webflow references (left over after Aleksandra manually
 * deletes their old single-locale item(s) from Webflow) and re-syncs them fresh through
 * the new two-locale-aware sync path.
 *
 * Why this is needed, not just "delete from Webflow then sync": each expert/service row
 * still stores the OLD webflow_item_id after Aleksandra deletes it on Webflow's side. If
 * you sync without clearing that first, the sync code tries to PATCH the now-dead ID,
 * gets a 404, fails to re-find it by slug (it's gone), and silently falls back to creating
 * a single-locale-only item again — reproducing the exact bug this whole fix was for.
 * Clearing webflow_item_id/webflow_slug/webflow_sync_status first makes the sync code treat
 * the expert as genuinely new, which is what triggers the correct two-locale creation path.
 *
 * Two modes:
 *   --find "<name or email fragment>"   Read-only search — prints matching experts + their
 *                                        services with current Webflow sync state, so you
 *                                        can find the right expert ID safely.
 *   <expertId>                          Report-only by default — prints exactly what would
 *                                        be cleared and re-synced, without doing it.
 *   <expertId> --confirm                Actually clears the stale fields, re-syncs the
 *                                        expert + their services, then prints the resulting
 *                                        state in both locales (fetched live from Webflow)
 *                                        so you can confirm it worked without leaving the shell.
 *
 * Run from the backend directory (e.g. in Render's shell):
 *   node src/scripts/resetAndResyncWebflowExpert.js --find "Ludovica"
 *   node src/scripts/resetAndResyncWebflowExpert.js 123
 *   node src/scripts/resetAndResyncWebflowExpert.js 123 --confirm
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = require('../prisma/client');
const webflowService = require('../services/webflow.service');

const CONFIRM = process.argv.includes('--confirm');

const WEBFLOW_BASE = 'https://api.webflow.com/v2';
async function wf(endpoint) {
  const res = await fetch(`${WEBFLOW_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) return { status: res.status };
  return { status: res.status, ...(await res.json()) };
}

async function getLocaleCmsIds() {
  if (!process.env.WEBFLOW_SITE_ID) return null;
  const site = await wf(`/sites/${process.env.WEBFLOW_SITE_ID}`);
  const all  = [site.locales?.primary, ...(site.locales?.secondary || [])].filter(Boolean);
  const find = (prefix) => all.find((l) => (l.tag || '').toLowerCase().startsWith(prefix))?.cmsLocaleId || null;
  const en = find('en');
  const it = find('it');
  return en && it ? { EN: en, IT: it } : null;
}

async function printLiveState(label, collectionId, itemId, locales) {
  if (!itemId) { console.log(`  ${label}: no webflow_item_id — nothing synced yet`); return; }
  if (!locales) { console.log(`  ${label}: site not localized — skipping per-locale check`); return; }
  for (const [key, cmsLocaleId] of Object.entries(locales)) {
    const item = await wf(`/collections/${collectionId}/items/${itemId}?cmsLocaleId=${cmsLocaleId}`);
    if (item.status && item.status !== 200) {
      console.log(`  ${label} [${key}]: not found (status ${item.status})`);
    } else {
      console.log(`  ${label} [${key}]: isDraft=${item.isDraft} lastPublished=${item.lastPublished}`);
    }
  }
}

// Checks whether the expert's reference-collection values (languages, city, certifications)
// already exist in Webflow as items created BEFORE the locale fix — those are single-locale
// only and hit the identical "can't add a locale to an existing item via the API" wall as
// Expert/Service items did, causing a "Referenced item not found" 400 the moment the expert
// is synced into the locale that item is missing from. Confirmed live: this is exactly what
// blocked a real resync attempt during testing (Swedish/Norwegian/Finnish/a city, all
// pre-existing values, all missing the Italian locale variant).
async function checkReferenceLocaleCoverage(expert, locales) {
  if (!locales) return [];
  const problems = [];

  async function checkValue(collectionId, collectionLabel, name) {
    if (!name || !collectionId) return;
    const list  = await wf(`/collections/${collectionId}/items?limit=100`);
    const items = list.items || [];
    const found = items.find((i) => (i.fieldData?.name || '').toLowerCase().trim() === name.toLowerCase().trim());
    if (!found) return; // doesn't exist yet — will be auto-created correctly in both locales
    const check = await wf(`/collections/${collectionId}/items/${found.id}?cmsLocaleId=${locales.IT}`);
    if (check.status && check.status !== 200) {
      problems.push({ collection: collectionLabel, name, itemId: found.id });
    }
  }

  for (const lang of expert.languages || []) {
    await checkValue(process.env.WEBFLOW_LANGUAGES_COLLECTION_ID, 'Languages', lang);
  }
  if (expert.address_city) {
    await checkValue(process.env.WEBFLOW_LOCATIONS_COLLECTION_ID, 'Locations', expert.address_city);
  }
  for (const cert of expert.certifications || []) {
    await checkValue(process.env.WEBFLOW_CERTIFICATIONS_COLLECTION_ID, 'Certifications', cert.name);
  }

  return problems;
}

async function findExperts(term) {
  const experts = await prisma.expert.findMany({
    where: {
      OR: [
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ],
    },
    include: {
      user:     { select: { name: true, email: true, language: true } },
      services: { select: { id: true, title: true, webflow_item_id: true, is_active: true } },
    },
  });

  if (!experts.length) { console.log(`No experts matched "${term}".`); return; }

  for (const e of experts) {
    console.log(`\nExpert ${e.id} — ${e.user.name} <${e.user.email}> (language: ${e.user.language})`);
    console.log(`  status: ${e.status}, webflow_item_id: ${e.webflow_item_id || '(none)'}, webflow_slug: ${e.webflow_slug || '(none)'}, sync_status: ${e.webflow_sync_status}`);
    for (const s of e.services) {
      console.log(`  service ${s.id} "${s.title}" (active: ${s.is_active}) — webflow_item_id: ${s.webflow_item_id || '(none)'}`);
    }
  }
}

async function resetAndResync(expertId) {
  const expert = await prisma.expert.findUnique({
    where:   { id: expertId },
    include: {
      user:           { select: { name: true, email: true, language: true } },
      services:       { select: { id: true, title: true, webflow_item_id: true, is_active: true } },
      certifications: { select: { name: true } },
    },
  });
  if (!expert) { console.error(`Expert ${expertId} not found.`); process.exit(1); }

  console.log(`Expert ${expert.id} — ${expert.user.name} <${expert.user.email}> (language: ${expert.user.language})`);
  console.log(`  current webflow_item_id: ${expert.webflow_item_id || '(none)'}, webflow_slug: ${expert.webflow_slug || '(none)'}`);
  for (const s of expert.services) {
    console.log(`  service ${s.id} "${s.title}" — current webflow_item_id: ${s.webflow_item_id || '(none)'}`);
  }

  console.log('\nChecking reference values (languages, city, certifications) for locale coverage...');
  const locales  = await getLocaleCmsIds();
  const problems = await checkReferenceLocaleCoverage(expert, locales);
  if (problems.length) {
    console.log('\n⚠ These reference values pre-date the locale fix and are missing the Italian locale.');
    console.log('  Syncing this expert into Italian WILL FAIL until Aleksandra deletes these from Webflow');
    console.log('  too (they will then be auto-recreated correctly in both locales on next sync):');
    for (const p of problems) console.log(`    - [${p.collection}] "${p.name}" (item ${p.itemId})`);
  } else {
    console.log('  OK — no known blockers.');
  }

  if (!CONFIRM) {
    console.log('\nReport-only mode — pass --confirm to actually clear + re-sync.');
    console.log(`  node src/scripts/resetAndResyncWebflowExpert.js ${expertId} --confirm`);
    return;
  }

  if (problems.length) {
    console.log('\nAborting — resolve the reference-value blockers above before re-syncing with --confirm.');
    return;
  }

  console.log('\nClearing stale Webflow references...');
  await prisma.expert.update({
    where: { id: expertId },
    data:  {
      webflow_item_id:     null,
      webflow_slug:        null,
      webflow_sync_status: 'UNSYNCED',
      webflow_synced_at:   null,
      webflow_sync_error:  null,
    },
  });
  if (expert.services.length) {
    await prisma.service.updateMany({
      where: { expert_id: expertId },
      data:  {
        webflow_item_id:     null,
        webflow_slug:        null,
        webflow_sync_status: 'UNSYNCED',
        webflow_synced_at:   null,
        webflow_sync_error:  null,
      },
    });
  }
  console.log('Cleared.');

  console.log('\nRe-syncing expert...');
  const itemId = await webflowService.syncExpert(expertId);
  console.log(`Expert synced → ${itemId}`);

  console.log('\nRe-syncing services...');
  await webflowService.syncExpertServices(expertId);

  console.log('\nVerifying live state on Webflow...');
  const updated = await prisma.expert.findUnique({
    where:  { id: expertId },
    select: { webflow_item_id: true },
  });
  await printLiveState('Expert', process.env.WEBFLOW_EXPERTS_COLLECTION_ID, updated.webflow_item_id, locales);

  const services = await prisma.service.findMany({ where: { expert_id: expertId, is_active: true } });
  for (const s of services) {
    await printLiveState(`Service ${s.id} "${s.title}"`, process.env.WEBFLOW_SERVICES_COLLECTION_ID, s.webflow_item_id, locales);
  }

  console.log('\nDone.');
}

async function main() {
  const findIdx = process.argv.indexOf('--find');
  if (findIdx !== -1) {
    const term = process.argv[findIdx + 1];
    if (!term) { console.error('Usage: node src/scripts/resetAndResyncWebflowExpert.js --find "<name or email fragment>"'); process.exit(1); }
    await findExperts(term);
    return;
  }

  const idArg = process.argv[2];
  const expertId = parseInt(idArg, 10);
  if (!idArg || Number.isNaN(expertId)) {
    console.error('Usage:');
    console.error('  node src/scripts/resetAndResyncWebflowExpert.js --find "<name or email fragment>"');
    console.error('  node src/scripts/resetAndResyncWebflowExpert.js <expertId> [--confirm]');
    process.exit(1);
  }
  await resetAndResync(expertId);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
