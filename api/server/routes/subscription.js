const express = require('express');
const router = express.Router();
const { subscriptionHandler } = require('../utils/useStripeSubscription');
const { setCurrentUser } = require('~/server/middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const findOrCreateCustomerId = require('../utils/findOrCreateCustomerId');

router.use(ClerkExpressRequireAuth(), setCurrentUser);

router.all('/', async (req, res) => {
  const customerId = await findOrCreateCustomerId(req.auth.userId);
  res.json(await subscriptionHandler({ customerId, query: req.query, body: req.body }));
});

module.exports = router;
