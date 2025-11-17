// api/server/routes/stripeWebhook.js
const express = require('express');
const { stripeWebhookController } = require('~/server/controllers/StripeController');

const router = express.Router();

// Stripe requires the raw body for signature verification
router.post('/webhook', express.raw({ type: 'application/json' }), stripeWebhookController);

module.exports = router;
