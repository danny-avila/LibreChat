// api/server/routes/stripeCheckout.js
const express = require('express');
const { createCheckoutSessionController } = require('~/server/controllers/StripeCheckoutController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.post('/create-checkout-session', requireJwtAuth, createCheckoutSessionController);

module.exports = router;
