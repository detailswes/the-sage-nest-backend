/**
 * Diagnostic: prints Experts collection field slugs + reference collection item names.
 * Run from backend directory:
 *   node src/scripts/webflowDiagnostic.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const BASE  = 'https://api.webflow.com/v2';
const TOKEN = process.env.WEBFLOW_API_TOKEN;

async function wf(endpoint) {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${endpoint} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const COLLECTIONS = {
  'Experts':              process.env.WEBFLOW_EXPERTS_COLLECTION_ID,
  'Services (Export)':    process.env.WEBFLOW_SERVICES_COLLECTION_ID,
  'Language (Experts)':   '69bdafc215390a2929a9d1fe',
  'Certification (Experts)': '69a29de5b63efdbdc53cdf5e',
  'Locations (Experts)':  '6990c1772d916dd2c85f09ca',
  'Services Categories':  '69a2a18eb3af0cc71290fa51',
};

async function main() {
  for (const [label, id] of Object.entries(COLLECTIONS)) {
    if (!id) { console.log(`\n[${label}] — ID not set, skipping`); continue; }

    console.log(`\n── ${label} (${id}) ─────────────────────`);

    // Print collection fields
    try {
      const col = await wf(`/collections/${id}`);
      const fields = col.fields || [];
      if (fields.length) {
        console.log('  Fields:');
        for (const f of fields) {
          console.log(`    slug="${f.slug}"  type=${f.type}  name="${f.displayName}"`);
        }
      }
    } catch (err) {
      console.log(`  [fields error] ${err.message}`);
    }

    // Print existing items (name only)
    try {
      const data  = await wf(`/collections/${id}/items?limit=100`);
      const items = data.items || [];
      if (items.length) {
        console.log('  Items:');
        for (const item of items) {
          console.log(`    id="${item.id}"  name="${item.fieldData?.name}"`);
        }
      } else {
        console.log('  (no items)');
      }
    } catch (err) {
      console.log(`  [items error] ${err.message}`);
    }
  }
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
