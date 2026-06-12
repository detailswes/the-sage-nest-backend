const cron = require('node-cron');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const prisma = require('../prisma/client');
const { processStripeEvent } = require('../controllers/stripe.controller');

// Events stuck at processed=false for longer than this are considered failed.
// The delay prevents the retry from racing with a still-in-flight first attempt.
const RETRY_AFTER_MINUTES = 10;

async function runWebhookRetry() {
  const cutoff = new Date(Date.now() - RETRY_AFTER_MINUTES * 60 * 1000);

  const stuck = await prisma.stripeEvent.findMany({
    where: {
      processed:    false,
      processed_at: { lt: cutoff },  // processed_at is set to now() on row creation
    },
    select: { stripe_event_id: true },
  });

  if (stuck.length === 0) return;

  console.log(`[WebhookRetry] ${stuck.length} unprocessed event(s) found — retrying`);

  for (const row of stuck) {
    try {
      const event = await stripe.events.retrieve(row.stripe_event_id);

      await processStripeEvent(event);

      await prisma.stripeEvent.update({
        where: { stripe_event_id: row.stripe_event_id },
        data:  { processed: true },
      });

      console.log(`[WebhookRetry] ${row.stripe_event_id} (${event.type}) — retry succeeded`);
    } catch (err) {
      console.error(`[WebhookRetry] ${row.stripe_event_id} — retry failed:`, err.message);
      // Leave processed=false; will be retried on the next run.
      // Stripe keeps events for 30 days, so there is no urgency.
    }
  }
}

function startWebhookRetryJob() {
  // Runs every 10 minutes — matched to RETRY_AFTER_MINUTES so a failed event
  // is retried on the very next run after the cooling-off period expires.
  cron.schedule('*/10 * * * *', async () => {
    try {
      await runWebhookRetry();
    } catch (err) {
      console.error('[WebhookRetry] Unexpected error:', err);
    }
  });

  console.log('[WebhookRetry] Failed-webhook retry job scheduled (runs every 10 min)');
}

module.exports = { startWebhookRetryJob, runWebhookRetry };
