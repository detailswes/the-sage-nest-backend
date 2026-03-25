// This router is mounted BEFORE express.json() with express.raw() middleware
// so that the raw Buffer is available for Stripe signature verification.
const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/stripe.controller');

// POST /stripe/webhook
router.post('/', handleWebhook);

module.exports = router;
