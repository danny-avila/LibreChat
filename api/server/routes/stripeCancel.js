// api/server/routes/stripeCancel.js
const express = require('express');
const { cancelSubscriptionController } = require('~/server/controllers/StripeCancelController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.post('/cancel-subscription', requireJwtAuth, cancelSubscriptionController);

module.exports = router;
