const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { VALID_CURRENCIES } = require('../constants/currency');
const { logAudit } = require('../utils/auditLog');
const { sendAdminPayoutAlert, sendExpertCurrencyChangedEmail } = require('../utils/email');

// ─── Currency anchoring ────────────────────────────────────────────────────
//
// Expert.currency is never guessed from country/address — it's set only from
// Stripe's own `default_currency` on the connected account, which is what the
// account actually settles payouts in. Two call sites feed into this:
//   - syncExpertCurrencyOnReturn: right after the expert finishes onboarding
//     (handleStripeReturn), for the initial confirmation.
//   - syncExpertCurrencyFromWebhook: on every `account.updated` event, for
//     the lifetime of the account — this is what catches a currency change
//     that happens after the fact (e.g. the expert edits their Stripe bank
//     details to a different country).
// Both funnel through applyStripeCurrency so first-confirmation vs. changed-
// after-confirmation is handled in exactly one place.

async function applyStripeCurrency(expert, rawCurrency) {
  if (!rawCurrency) return;
  const newCurrency = rawCurrency.toUpperCase();

  if (!VALID_CURRENCIES.includes(newCurrency)) {
    console.error(
      `[Currency] Expert ${expert.id} Stripe account ${expert.stripe_account_id} reports unsupported currency ${newCurrency} — leaving unconfirmed.`
    );
    sendAdminPayoutAlert({
      subject: `Unsupported Stripe currency — expert ${expert.id}`,
      body: `Expert ${expert.id}'s connected account (${expert.stripe_account_id}) reports default_currency=${newCurrency}, which isn't one of the platform's supported currencies (${VALID_CURRENCIES.join(', ')}). They won't be able to add or publish services until this is resolved.`,
      stripeAccountId: expert.stripe_account_id,
    }).catch(() => {});
    return;
  }

  // First confirmation — nothing was on file before, so there's no prior
  // currency (and therefore no live service) that could conflict.
  if (!expert.currency) {
    await prisma.expert.update({ where: { id: expert.id }, data: { currency: newCurrency } });
    console.log(`[Currency] Expert ${expert.id} currency confirmed: ${newCurrency}`);
    return;
  }

  if (expert.currency === newCurrency) return; // already in sync, nothing to do

  // Currency changed after already being confirmed. Never silently rewrite
  // prices — unpublish the affected services and require the expert to
  // review + resave each one (service.controller.js only lets a service's
  // currency be realigned to expert.currency explicitly, together with its
  // price, which is what "resaving" means here).
  const activeServices = await prisma.service.findMany({
    where: { expert_id: expert.id, is_active: true },
  });

  await prisma.$transaction([
    prisma.expert.update({ where: { id: expert.id }, data: { currency: newCurrency } }),
    ...(activeServices.length
      ? [prisma.service.updateMany({
          where: { id: { in: activeServices.map((s) => s.id) } },
          data:  { is_active: false },
        })]
      : []),
  ]);

  logAudit(
    expert.user_id, 'EXPERT_CURRENCY_CHANGED', 'EXPERT', expert.id,
    `Stripe account currency changed ${expert.currency} → ${newCurrency}. ${activeServices.length} active service(s) unpublished pending expert reconfirmation.`
  );
  console.warn(
    `[Currency] Expert ${expert.id} currency changed ${expert.currency} → ${newCurrency} — ${activeServices.length} service(s) unpublished.`
  );

  const user = await prisma.user.findUnique({
    where:  { id: expert.user_id },
    select: { email: true, name: true, language: true },
  });

  if (user) {
    prisma.notification.create({
      data: {
        user_id: expert.user_id,
        type:    'CURRENCY_CHANGED',
        title:   'Your Stripe account currency changed',
        body:    `Your account currency changed from ${expert.currency} to ${newCurrency}. ${activeServices.length} service(s) were unpublished — review their price and save to republish.`,
      },
    }).catch((e) => console.error('[Notification] Currency-changed notification failed:', e.message));

    sendExpertCurrencyChangedEmail({
      to: user.email,
      name: user.name,
      language: user.language,
      oldCurrency: expert.currency,
      newCurrency,
      affectedCount: activeServices.length,
    }).catch((e) => console.error('[Email] Currency-changed alert failed:', e.message));
  }

  sendAdminPayoutAlert({
    subject: `Expert Stripe currency changed — expert ${expert.id}`,
    body: `Expert ${expert.id} (${user?.name || 'unknown'})'s Stripe account currency changed from ${expert.currency} to ${newCurrency}. ${activeServices.length} active service(s) were unpublished pending the expert's reconfirmation.`,
    stripeAccountId: expert.stripe_account_id,
    expertName: user?.name,
  }).catch((e) => console.error('[Email] Admin currency-change alert failed:', e.message));
}

// Initial confirmation, called right after the expert returns from Stripe
// onboarding. No webhook payload is available at that point, so this reads
// the account directly. Uses the v1 `accounts.retrieve` endpoint — like the
// payout-schedule update in createConnectLink, v1 endpoints remain
// interoperable with v2-created account IDs, and default_currency is a v1
// Account field.
async function syncExpertCurrencyOnReturn(expert) {
  try {
    const account = await stripe.accounts.retrieve(expert.stripe_account_id);
    await applyStripeCurrency(expert, account.default_currency);
  } catch (e) {
    console.error(`[Currency] Could not read default_currency for expert ${expert.id}:`, e.message);
  }
}

// Ongoing sync, called from the account.updated webhook handler — the
// durable source of truth for currency changes for the lifetime of the account.
async function syncExpertCurrencyFromWebhook(account) {
  const expert = await prisma.expert.findFirst({ where: { stripe_account_id: account.id } });
  if (!expert) return;
  await applyStripeCurrency(expert, account.default_currency);
}

module.exports = { syncExpertCurrencyOnReturn, syncExpertCurrencyFromWebhook };
