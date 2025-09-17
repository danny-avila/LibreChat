const express = require('express');
const router = express.Router();
const redisHealth = require('~/cache/redisHealth');
const { logger } = require('~/config');

/**
 * @route GET /status/redis
 * @description Get Redis connection status
 * @returns {Object} Redis status information
 */
router.get('/redis', async (req, res) => {
  try {
    const status = redisHealth.getStatus();
    res.status(200).json({
      success: true,
      redis: {
        connected: status.isHealthy,
        status: status.status,
        lastPing: status.lastPingTime,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('[Status] Error getting Redis status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Redis status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
