const express = require('express');
const router = express.Router();
const omnexioBalanceController = require('../controllers/omnexio/OmnexioBalance');
const omnexioSubscriptionCheckoutController = require('../controllers/omnexio/OmnexioSubscriptionCheckout');
const { requireJwtAuth } = require('../middleware/');
const omnexioSubscriptionPlans = require('~/server/controllers/omnexio/omnexioSubscriptionPlans');

router.get('/balance', requireJwtAuth, omnexioBalanceController);
router.post('/subscriptions', requireJwtAuth, omnexioSubscriptionCheckoutController);
router.get('/subscription-plans', requireJwtAuth, omnexioSubscriptionPlans);

module.exports = router;
