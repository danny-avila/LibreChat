const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger } = require('../../../config');

/**
 * Proxy endpoint to fetch model information from LiteLLM
 * This keeps the API key secure on the server and avoids exposing it to clients
 *
 * @route GET /api/forked/litellm/model-info
 * @returns {object} Model information including pricing and context windows
 */
router.get('/model-info', async (req, res) => {
  try {
    const apiKey = process.env.LITELLM_API_KEY;

    if (!apiKey) {
      logger.error('LITELLM_API_KEY not found in environment variables');
      return res.status(500).json({ error: 'LiteLLM API key not configured' });
    }

    const baseURL = process.env.LITELLM_BASE_URL || 'https://litellm.danieldjupvik.com';
    const response = await axios.get(`${baseURL}/model/info`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Cache header to reduce load on LiteLLM service
    // Cache for 1 hour (3600 seconds)
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.json(response.data);
  } catch (error) {
    logger.error('Error fetching LiteLLM model info:', error);

    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      logger.error(`Failed to fetch LiteLLM model info: ${error.response.status} ${error.response.statusText}`);
      return res.status(error.response.status).json({
        error: 'Failed to fetch model information',
        status: error.response.status,
        message: error.response.statusText,
      });
    } else if (error.request) {
      // The request was made but no response was received
      logger.error('No response received from LiteLLM API');
      return res.status(502).json({
        error: 'No response received from LiteLLM API',
        message: 'Service may be down or unreachable',
      });
    }

    return res.status(500).json({
      error: 'Internal server error while fetching model information',
      message: error.message,
    });
  }
});

module.exports = router;