const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// ─── Registration: 3 attempts per IP per hour ────────────────────────────────
const registrationLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many accounts created from this address. Please try again in an hour.' },
});

// ─── Password reset: 3 requests per email per hour ───────────────────────────
// Keyed by normalised email so an attacker cannot bypass by rotating IPs.
// Falls back to IP if the body has no email (malformed requests).
const passwordResetLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             3,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => (req.body?.email || '').toLowerCase().trim() || ipKeyGenerator(req.ip),
  message:         { error: 'Too many password reset requests. Please try again in an hour.' },
});

// ─── OTP resend: 5 resends per IP per 15 minutes ─────────────────────────────
const otpResendLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many code requests. Please wait before requesting another.' },
});

// ─── Login: 10 attempts per IP per 15 minutes ────────────────────────────────
// Complements the per-account lockout (5 attempts). An attacker rotating across
// many accounts can exhaust 4 attempts per account before being blocked here.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts from this address. Please try again in 15 minutes.' },
});

// ─── Password reset token submission: 5 per IP per 15 minutes ────────────────
// Prevents token grinding — the token is 64-byte hex but rate-limiting adds
// a low-cost defence-in-depth layer.
const resetPasswordLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many password reset attempts. Please try again in 15 minutes.' },
});

module.exports = {
  registrationLimiter,
  passwordResetLimiter,
  otpResendLimiter,
  loginLimiter,
  resetPasswordLimiter,
};
