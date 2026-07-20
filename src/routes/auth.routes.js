const express = require('express');
const router = express.Router();
const {
  register, login, refresh, logout,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword,
  getProfile, updateProfile, updateLanguagePreference, updateEmail, changePassword, deleteAccount,
  getLegalVersions,
  verifyOtp, resendOtp,
  get2FAStatus, sendSetupOtp, enable2FA, disable2FA,
  exportMyData,
  getParentNotificationPrefs, updateParentNotificationPrefs,
  getLegalConsents, updateMarketingConsent,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { registrationLimiter, passwordResetLimiter, otpResendLimiter, loginLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter');

router.get ('/legal-versions',       getLegalVersions);  // public — used by policy pages
router.post('/register',            registrationLimiter, register);
router.post('/login',               loginLimiter, login);
router.post('/refresh',             refresh);
router.post('/logout',              logout);
router.post('/verify-email',        verifyEmail);
router.post('/resend-verification', otpResendLimiter, resendVerification);
router.post('/forgot-password',     passwordResetLimiter, forgotPassword);
router.post('/reset-password',      resetPasswordLimiter, resetPassword);

// ── Profile management — all require authentication ───────────────────────────
router.get   ('/profile',          authenticate, getProfile);
router.patch ('/profile',          authenticate, updateProfile);
router.patch ('/language',         authenticate, updateLanguagePreference);
router.patch ('/profile/email',    authenticate, updateEmail);
router.patch ('/profile/password', authenticate, changePassword);
router.delete('/account',          authenticate, deleteAccount);
router.get   ('/data-export',               authenticate, exportMyData);
router.get   ('/notification-preferences',  authenticate, getParentNotificationPrefs);
router.patch ('/notification-preferences',  authenticate, updateParentNotificationPrefs);
router.get   ('/legal-consents',            authenticate, getLegalConsents);
router.patch ('/marketing-consent',         authenticate, updateMarketingConsent);

// ── 2FA login flow — public (uses otp_token JWT, no session yet) ──────────────
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', otpResendLimiter, resendOtp);

// ── 2FA settings — require authentication ────────────────────────────────────
router.get ('/2fa/status',    authenticate, get2FAStatus);
router.post('/2fa/send-otp',  authenticate, sendSetupOtp);
router.post('/2fa/enable',    authenticate, enable2FA);
router.post('/2fa/disable',   authenticate, disable2FA);

module.exports = router;
