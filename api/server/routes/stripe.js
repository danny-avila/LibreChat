// api/server/routes/stripe.js
const express = require('express');
const { subscribeController, subscriptionStatusController } = require('~/server/controllers/StripeController');
const { requireJwtAuth } = require('~/server/middleware');
const { billingPortalController } = require('~/server/controllers/StripeController');

const router = express.Router();

router.post('/subscribe', requireJwtAuth, subscribeController);
router.get('/status', requireJwtAuth, subscriptionStatusController);
router.post('/billing-portal', requireJwtAuth, billingPortalController);

module.exports = router;
