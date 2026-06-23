const rateLimit = require('express-rate-limit');

// ─── Shared Redis store (optional) ───────────────────────────────────────────
// When REDIS_URL is set the store is shared across all instances and survives
// restarts, which is required for the per-IP limiter to work correctly in a
// multi-instance deployment (e.g. Render with multiple replicas).
// Without REDIS_URL the limiter falls back to the default in-memory store,
// which is sufficient for single-instance dev / staging environments.
let redisStore = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    const { RedisStore } = require('rate-limit-redis');
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });
    redisStore = (prefix) => new RedisStore({ sendCommand: (...args) => redis.call(...args), prefix });
    console.log('[RateLimit] Redis store initialised — limits shared across instances');
  } catch (err) {
    console.warn('[RateLimit] Failed to initialise Redis store, falling back to memory:', err.message);
  }
}

// ─── True client IP ───────────────────────────────────────────────────────────
// The deployment chain is: Client → Cloudflare → Render → Express.
// Cloudflare sets CF-Connecting-IP to the verified real client IP and strips
// any client-supplied header of the same name, so it cannot be spoofed through
// Cloudflare. Fall back to req.ip (which relies on trust proxy) for dev/staging
// environments that don't sit behind Cloudflare.
function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.ip ||
    'unknown'
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ipKey    = (req) => `ip:${getClientIp(req)}`;
const emailKey = (req) => {
  const email = (req.body?.email || '').toLowerCase().trim();
  return email ? `email:${email}` : ipKey(req);
};

function makeStore(prefix) {
  return redisStore ? redisStore(prefix) : undefined; // undefined → memory store
}

// ─── Registration: 3 per IP per hour ─────────────────────────────────────────
const registrationLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    ipKey,
  store:           makeStore('rl:reg:'),
  message:         { error: 'Too many accounts created from this address. Please try again in an hour.' },
});

// ─── Password reset request: 3 per email per hour ────────────────────────────
// Keyed by normalised email so rotating IPs cannot bypass it.
const passwordResetLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    emailKey,
  store:           makeStore('rl:pwreset:'),
  message:         { error: 'Too many password reset requests. Please try again in an hour.' },
});

// ─── OTP resend: 5 per IP per 15 minutes ─────────────────────────────────────
const otpResendLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    ipKey,
  store:           makeStore('rl:otpresend:'),
  message:         { error: 'Too many code requests. Please wait before requesting another.' },
});

// ─── Login: 10 attempts per IP per 15 minutes ────────────────────────────────
// Complements the per-account lockout (5 attempts). An attacker rotating across
// many accounts can exhaust 4 attempts per account before being stopped here.
// Keyed on the real client IP extracted from CF-Connecting-IP so Cloudflare's
// rotating egress addresses don't fragment the counter.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    ipKey,
  store:           makeStore('rl:login:'),
  message:         { error: 'Too many login attempts from this address. Please try again in 15 minutes.' },
});

// ─── Password reset token submission: 5 per IP per 15 minutes ────────────────
const resetPasswordLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    ipKey,
  store:           makeStore('rl:resetpw:'),
  message:         { error: 'Too many password reset attempts. Please try again in 15 minutes.' },
});

module.exports = {
  registrationLimiter,
  passwordResetLimiter,
  otpResendLimiter,
  loginLimiter,
  resetPasswordLimiter,
};
