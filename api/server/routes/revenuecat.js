const express = require('express');
const {
  getRevenueCatConfig,
  handleWebhookEvent,
  verifyWebhookAuthorization,
} = require('~/server/services/Billing/RevenueCatService');

const router = express.Router();

router.post('/', async (req, res) => {
  const config = getRevenueCatConfig();

  if (!config.secretApiKey) {
    return res.status(503).json({ error: 'RevenueCat is not configured.' });
  }

  if (!config.webhookAuth) {
    return res.status(503).json({ error: 'RevenueCat webhook authorization is not configured.' });
  }

  if (!verifyWebhookAuthorization(req.headers.authorization)) {
    return res.status(401).json({ error: 'Invalid RevenueCat webhook authorization.' });
  }

  try {
    const result = await handleWebhookEvent(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
