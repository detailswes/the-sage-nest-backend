const express = require('express');
const router = express.Router();
const {
  register, login, refresh, logout,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword,
  getProfile, updateProfile, updateEmail, changePassword, deleteAccount,
  acceptPrivacyPolicy, getLegalVersions,
  verifyOtp, resendOtp,
  get2FAStatus, sendSetupOtp, enable2FA, disable2FA,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get ('/legal-versions',       getLegalVersions);  // public — used by policy pages
router.post('/register',            register);
router.post('/login',               login);
router.post('/refresh',             refresh);
router.post('/logout',              logout);
router.post('/verify-email',        verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/forgot-password',     forgotPassword);
router.post('/reset-password',      resetPassword);

// ── Profile management — all require authentication ───────────────────────────
router.get   ('/profile',          authenticate, getProfile);
router.patch ('/profile',          authenticate, updateProfile);
router.patch ('/profile/email',    authenticate, updateEmail);
router.patch ('/profile/password', authenticate, changePassword);
router.delete('/account',          authenticate, deleteAccount);
router.post  ('/accept-pp',        authenticate, acceptPrivacyPolicy);

// ── 2FA login flow — public (uses otp_token JWT, no session yet) ──────────────
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// ── 2FA settings — require authentication ────────────────────────────────────
router.get ('/2fa/status',    authenticate, get2FAStatus);
router.post('/2fa/send-otp',  authenticate, sendSetupOtp);
router.post('/2fa/enable',    authenticate, enable2FA);
router.post('/2fa/disable',   authenticate, disable2FA);

module.exports = router;
