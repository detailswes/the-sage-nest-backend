/**
 * One-time backfill for experts who connected Stripe *before* currency
 * anchoring existed: their Expert.currency is still null, and — since the
 * ongoing sync only fires on the next `account.updated` webhook — nothing
 * will set it unless we read it from Stripe directly, once, right now.
 *
 * Reuses the same Stripe-read + first-confirmation logic as the live
 * onboarding-return flow (src/services/expertCurrency.service.js), so this
 * script and that code path can never disagree on what "confirmed" means.
 *
 * This intentionally does NOT touch any Service row. Setting Expert.currency
 * for the first time never needs to — no service could have been created
 * without a confirmed currency after this fix (service.controller.js blocks
 * that) — so any pre-existing mismatched services are a data-cleanup problem,
 * not a backfill problem. Use correctServicePricing.js for those, with prices
 * supplied explicitly rather than guessed.
 *
 * Run from the backend directory:
 *   node src/scripts/backfillExpertCurrency.js            # apply changes
 *   node src/scripts/backfillExpertCurrency.js --dry-run   # preview only
 *
 * Safe to re-run — experts who already have a confirmed currency are skipped.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { VALID_CURRENCIES } = require('../constants/currency');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? 'Running in DRY-RUN mode — no changes will be written.\n' : 'Applying changes.\n');

  const experts = await prisma.expert.findMany({
    where:   { currency: null, stripe_account_id: { not: null } },
    include: { user: { select: { name: true } } },
  });

  console.log(`Connected experts missing a confirmed currency: ${experts.length}`);

  let confirmed = 0, unsupported = 0, skipped = 0;
  for (const expert of experts) {
    try {
      const account = await stripe.accounts.retrieve(expert.stripe_account_id);
      const currency = account.default_currency ? account.default_currency.toUpperCase() : null;

      if (!currency) {
        console.log(`  Expert ${expert.id} (${expert.user.name}) — Stripe reports no default_currency yet, skipping.`);
        skipped++;
        continue;
      }
      if (!VALID_CURRENCIES.includes(currency)) {
        console.log(`  Expert ${expert.id} (${expert.user.name}) — unsupported currency ${currency}, needs manual review.`);
        unsupported++;
        continue;
      }

      console.log(`  Expert ${expert.id} (${expert.user.name}) — confirmed ${currency}`);
      if (!DRY_RUN) {
        await prisma.expert.update({ where: { id: expert.id }, data: { currency } });
      }
      confirmed++;
    } catch (e) {
      console.log(`  Expert ${expert.id} (${expert.user.name}) — Stripe lookup failed: ${e.message}`);
    }
  }

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`  Confirmed   : ${confirmed}`);
  console.log(`  Unsupported : ${unsupported}`);
  console.log(`  Skipped     : ${skipped}`);
  if (DRY_RUN) {
    console.log('\n  Dry run only — re-run without --dry-run to apply.');
  } else if (confirmed > 0) {
    console.log('\n  These experts can now add services. Any of their pre-existing services with');
    console.log('  a mismatched currency still need explicit correction — see correctServicePricing.js.');
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
