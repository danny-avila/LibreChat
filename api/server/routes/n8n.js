const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const { callN8nWebhook } = require('~/server/services/N8nService');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();
router.use(requireJwtAuth);

router.post('/webhook', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const response = await callN8nWebhook(text);
    
    res.json({ 
      success: true, 
      response: response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('[n8n route] Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process n8n webhook',
      message: error.message 
    });
  }
});

module.exports = router;