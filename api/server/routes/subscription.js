const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getSubscriptionProfile,
  getCheckoutLinkForUser,
} = require('~/server/services/Billing/RevenueCatService');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/me', async (req, res) => {
  try {
    const subscription = await getSubscriptionProfile({
      userId: req.user.id,
      appUserId: String(req.user.id),
    });

    res.status(200).json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const subscription = await getSubscriptionProfile({
      userId: req.user.id,
      appUserId: String(req.user.id),
      forceRefresh: true,
    });

    res.status(200).json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/checkout-link', async (req, res) => {
  try {
    const checkout = await getCheckoutLinkForUser(req.user);

    if (!checkout.checkoutUrl) {
      return res.status(503).json({
        error: 'RevenueCat hosted checkout is not configured.',
      });
    }

    res.status(200).json({
      url: checkout.checkoutUrl,
      entitlementId: checkout.entitlementId,
      webCheckoutEnabled: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
