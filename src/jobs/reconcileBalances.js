const cron = require('node-cron');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { sendAdminPayoutAlert } = require('../utils/email');

// ─── Core reconciliation logic (exported for testability) ─────────────────────
async function runBalanceReconciliation() {
  const experts = await prisma.expert.findMany({
    where: {
      stripe_account_id:         { not: null },
      stripe_onboarding_complete: true,
    },
    include: { user: { select: { name: true, email: true } } },
  });

  if (experts.length === 0) return;

  console.log(`[BalanceReconciliation] Checking balances for ${experts.length} connected account(s)`);

  const negatives = [];

  for (const expert of experts) {
    try {
      const balance = await stripe.balance.retrieve(
        {},
        { stripeAccount: expert.stripe_account_id }
      );

      // Check every currency on the account — any negative available or pending
      // balance means the expert owes money and payouts will fail.
      const allFunds = [
        ...(balance.available ?? []),
        ...(balance.pending   ?? []),
      ];

      const negativeEntries = allFunds.filter((b) => b.amount < 0);

      if (negativeEntries.length > 0) {
        const summary = negativeEntries
          .map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`)
          .join(', ');

        console.error(
          `[BalanceReconciliation] NEGATIVE BALANCE — expert=${expert.user.name} ` +
          `account=${expert.stripe_account_id} balance=${summary}`
        );

        negatives.push({ expert, summary });

        await sendAdminPayoutAlert({
          subject:        `Negative Stripe balance — ${expert.user.name}`,
          body:           `Expert ${expert.user.name} has a negative balance on their connected Stripe account (${summary}). This is typically caused by a chargeback or refund issued after a payout was already sent to their bank. Future payouts will fail until the balance is resolved. Please review the account in the Stripe dashboard and contact the expert if necessary.`,
          stripeAccountId: expert.stripe_account_id,
          expertName:      expert.user.name,
        });
      }
    } catch (err) {
      console.error(
        `[BalanceReconciliation] Failed to retrieve balance for account ${expert.stripe_account_id}:`,
        err.message
      );
    }
  }

  if (negatives.length === 0) {
    console.log('[BalanceReconciliation] All connected accounts have non-negative balances ✓');
  } else {
    console.warn(`[BalanceReconciliation] ${negatives.length} account(s) with negative balance — alerts sent`);
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
function startBalanceReconciliationJob() {
  // Runs once daily at 07:00 UTC — early enough to catch overnight chargeback
  // reversals before business hours.
  cron.schedule('0 7 * * *', async () => {
    try {
      await runBalanceReconciliation();
    } catch (err) {
      console.error('[BalanceReconciliation] Unexpected error:', err);
    }
  });

  console.log('[BalanceReconciliation] Daily balance check scheduled (07:00 UTC)');
}

module.exports = { startBalanceReconciliationJob, runBalanceReconciliation };
