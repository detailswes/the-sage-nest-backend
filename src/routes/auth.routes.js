const express = require('express');
const router = express.Router();
const {
  register, login, refresh, logout,
  verifyEmail, resendVerification,
  forgotPassword, resetPassword,
  getProfile, updateProfile, updateEmail, changePassword, deleteAccount,
  acceptPrivacyPolicy,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

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

module.exports = router;
