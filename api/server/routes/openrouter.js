const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { EModelEndpoint } = require('librechat-data-provider');
const initializeClient = require('~/server/services/Endpoints/openrouter/initialize');
const { logger } = require('~/config');

const router = express.Router();

/**
 * Get OpenRouter credits balance
 * @route GET /api/openrouter/credits
 */
router.get('/credits', requireJwtAuth, async (req, res) => {
  try {
    const { client } = await initializeClient({
      req,
      res,
      endpointOption: {
        endpoint: EModelEndpoint.openrouter,
      },
    });

    if (!client || !client.getCredits) {
      return res.status(501).json({ error: 'Credits API not available' });
    }

    const credits = await client.getCredits();
    res.json(credits);
  } catch (error) {
    logger.error('[OpenRouter] Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

/**
 * Get available OpenRouter models
 * @route GET /api/openrouter/models
 */
router.get('/models', requireJwtAuth, async (req, res) => {
  try {
    const { client } = await initializeClient({
      req,
      res,
      endpointOption: {
        endpoint: EModelEndpoint.openrouter,
      },
    });

    if (!client || !client.getModels) {
      return res.status(501).json({ error: 'Models API not available' });
    }

    const models = await client.getModels();
    res.json(models);
  } catch (error) {
    logger.error('[OpenRouter] Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

module.exports = router;
