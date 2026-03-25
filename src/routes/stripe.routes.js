const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { createConnectLink, handleStripeReturn } = require('../controllers/stripe.controller');

// POST /stripe/connect — create Stripe onboarding link
router.post('/connect', authenticate, createConnectLink);

// GET /stripe/return — verify Stripe onboarding completion
router.get('/return', authenticate, handleStripeReturn);

module.exports = router;
