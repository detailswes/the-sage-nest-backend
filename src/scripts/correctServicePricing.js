/**
 * Explicit, no-guessing correction for services that were created with the
 * wrong currency before currency anchoring existed (e.g. a service priced in
 * "500" tagged EUR when it was actually meant to be 500 DKK). This script
 * never converts or infers a price — every correction must state both the
 * currency AND the price explicitly, supplied by whoever knows what the
 * service was actually meant to cost. Relabelling only the currency code
 * would silently turn a 500 NOK service into a 500 EUR one — this script
 * refuses to do that.
 *
 * Input: a JSON file mapping service id -> corrected { currency, price }.
 *   {
 *     "42": { "currency": "DKK", "price": 700 },
 *     "43": { "currency": "DKK", "price": 950 }
 *   }
 *
 * Run from the backend directory:
 *   node src/scripts/correctServicePricing.js corrections.json            # apply
 *   node src/scripts/correctServicePricing.js corrections.json --dry-run   # preview
 *
 * Each corrected service is also re-pushed to Webflow immediately (if it's
 * active and already synced there) so the mirror never shows a stale
 * currency — Webflow itself is never the place currency is set or edited.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fs = require('fs');
const prisma = require('../prisma/client');
const webflowService = require('../services/webflow.service');
const { logAudit } = require('../utils/auditLog');
const { VALID_CURRENCIES, PRICE_LIMITS } = require('../constants/currency');

const DRY_RUN = process.argv.includes('--dry-run');
const filePath = process.argv[2];

async function main() {
  if (!filePath || filePath === '--dry-run') {
    console.error('Usage: node src/scripts/correctServicePricing.js <corrections.json> [--dry-run]');
    process.exit(1);
  }

  const corrections = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  const ids = Object.keys(corrections).map((id) => parseInt(id, 10));

  console.log(DRY_RUN ? 'Running in DRY-RUN mode — no changes will be written.\n' : 'Applying changes.\n');
  console.log(`${ids.length} correction(s) to process.\n`);

  let applied = 0, failed = 0;

  for (const id of ids) {
    const { currency, price } = corrections[id];

    const service = await prisma.service.findUnique({
      where:   { id },
      include: { expert: { select: { id: true, currency: true, status: true, webflow_item_id: true, user_id: true } } },
    });
    if (!service) {
      console.log(`  Service ${id} — not found, skipping.`);
      failed++;
      continue;
    }
    if (!VALID_CURRENCIES.includes(currency)) {
      console.log(`  Service ${id} — "${currency}" isn't a supported currency, skipping.`);
      failed++;
      continue;
    }
    if (service.expert.currency && currency !== service.expert.currency) {
      console.log(`  Service ${id} — correction currency ${currency} doesn't match expert's confirmed account currency ${service.expert.currency}, skipping. Fix the mapping or the expert's Stripe account first.`);
      failed++;
      continue;
    }
    const limits = PRICE_LIMITS[currency];
    const priceVal = parseFloat(price);
    if (isNaN(priceVal) || priceVal < limits.min || priceVal > limits.max) {
      console.log(`  Service ${id} — price ${price} is outside ${currency}'s allowed range (${limits.min}-${limits.max}), skipping.`);
      failed++;
      continue;
    }

    console.log(`  Service ${id} "${service.title}" — ${service.currency} ${service.price} → ${currency} ${priceVal}`);

    if (!DRY_RUN) {
      const updated = await prisma.service.update({
        where: { id },
        data:  { currency, price: priceVal },
      });

      logAudit(service.expert.user_id, 'SERVICE_PRICING_CORRECTED', 'SERVICE', id,
        `Manually corrected ${service.currency} ${service.price} → ${currency} ${priceVal} (data cleanup, pre-launch test data).`);

      // Re-push to Webflow immediately so the mirror doesn't keep showing the
      // stale currency until the next unrelated edit.
      if (updated.is_active && service.expert.status === 'APPROVED' && service.expert.webflow_item_id) {
        try {
          await webflowService.syncService(updated.id, service.expert.id, service.expert.webflow_item_id);
          console.log(`    → re-synced to Webflow`);
        } catch (e) {
          console.log(`    → Webflow re-sync failed: ${e.message} (will be retried by the sync job)`);
        }
      }
    }
    applied++;
  }

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Applied : ${applied}`);
  console.log(`  Failed  : ${failed}`);
  if (DRY_RUN) console.log('\n  Dry run only — re-run without --dry-run to apply.');
}

main()
  .catch(err => { console.error('\nFatal error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
