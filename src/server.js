const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config({
  path: path.join(__dirname, '../.env'), // always resolves to backend/.env
  override: true,                           // always wins over shell env vars
});

const app = express();

// Deployment chain: Client → Cloudflare → Render → Express (2 hops).
// Trusting both lets req.ip resolve to the real client address via X-Forwarded-For.
// The rate limiters additionally read CF-Connecting-IP directly for reliability.
app.set('trust proxy', 2);

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-By'],
}));

app.use(cookieParser());

// ── Stripe webhook MUST use raw body — register BEFORE express.json() ──────────
// Stripe signature verification requires the exact raw request buffer.
// Two paths registered: /stripe/webhook (internal) and /webhooks/stripe (ngrok config)
app.use(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  require('./routes/stripe.webhook.routes')
);

app.use(express.json());

// Serve uploaded profile images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/auth', require('./routes/auth.routes'));
app.use('/experts', require('./routes/expert.routes'));
app.use('/services', require('./routes/service.routes'));
app.use('/availability', require('./routes/availability.routes'));
app.use('/stripe', require('./routes/stripe.routes'));
app.use('/admin', require('./routes/admin.routes'));
app.use('/bookings', require('./routes/booking.routes'));
app.use('/blockouts', require('./routes/blockout.routes'));

app.get('/', (_req, res) => {
  res.json({ message: 'Sage Nest API is running' });
});

const { verifyEmailConnection } = require('./utils/email');
const { startCleanupJob }        = require('./jobs/cleanupPendingBookings');
const { startTransferJob }       = require('./jobs/processTransfers');
const { startReminderJob }       = require('./jobs/sendReminders');
const { startMarkCompletedJob }  = require('./jobs/markCompletedBookings');
const { startWebflowSyncJob }    = require('./jobs/webflowSyncJob');
const { startTokenCleanupJob }   = require('./jobs/cleanupExpiredTokens');
const { startWebhookRetryJob }          = require('./jobs/retryFailedWebhooks');
const { startBalanceReconciliationJob } = require('./jobs/reconcileBalances');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`[Webhook] Stripe webhook endpoint: POST /webhooks/stripe`);
  console.log(`[Webhook] STRIPE_WEBHOOK_SECRET set: ${!!process.env.STRIPE_WEBHOOK_SECRET}`);
  verifyEmailConnection();
  startCleanupJob();
  startTransferJob();
  startReminderJob();
  startMarkCompletedJob();
  startWebflowSyncJob();
  startTokenCleanupJob();
  startWebhookRetryJob();
  startBalanceReconciliationJob();
});
