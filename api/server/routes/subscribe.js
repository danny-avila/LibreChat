// Customize
const express = require('express');
const stripeWebhookController = require('~/server/controllers/StripeWebhookController');
const {
  subscribeInStripeController,
  // subscribeResultController,
  unSubscribeInStripeController,
  reactiveSubscriptionInStripeController,
  topupStripeController,
} = require('~/server/controllers/SubscribeController');
const { requireJwtAuth } = require('~/server/middleware');
const router = express.Router();

router.post('/premium', requireJwtAuth, subscribeInStripeController);
router.post('/topup', requireJwtAuth, topupStripeController);
router.post('/cancel', requireJwtAuth, unSubscribeInStripeController);
router.post('/reactive', requireJwtAuth, reactiveSubscriptionInStripeController);
// router.get('/result', subscribeResultController);
router.post('/webhook', stripeWebhookController);

module.exports = router;
