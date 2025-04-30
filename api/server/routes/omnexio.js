const express = require('express');
const router = express.Router();
const omnexioBalanceController = require('../controllers/omnexio/OmnexioBalance');
const omnexioSubscriptionCheckoutController = require('../controllers/omnexio/OmnexioSubscriptionCheckout');
const { requireJwtAuth } = require('../middleware/');

router.get('/balance', requireJwtAuth, omnexioBalanceController);
router.post('/subscriptions', requireJwtAuth, omnexioSubscriptionCheckoutController);

module.exports = router;
