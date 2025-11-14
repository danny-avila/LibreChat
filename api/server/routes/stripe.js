// api/server/routes/stripe.js
const express = require('express');
const { subscribeController, subscriptionStatusController, productPurchaseController } = require('~/server/controllers/StripeController');
const { requireJwtAuth } = require('~/server/middleware');
const { billingPortalController } = require('~/server/controllers/StripeController');

const router = express.Router();


// One-time product purchase
router.post('/purchase', requireJwtAuth, productPurchaseController);

router.post('/subscribe', requireJwtAuth, subscribeController);
router.get('/status', requireJwtAuth, subscriptionStatusController);
router.post('/billing-portal', requireJwtAuth, billingPortalController);

module.exports = router;
