const express = require('express');
const { logger } = require('@librechat/data-schemas');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const { getBanner, getActiveBanners } = require('~/models');

const router = express.Router();

/**
 * GET /api/banner
 * Get first active banner (legacy endpoint)
 * Maintains backward compatibility with existing code
 */
router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    res.status(200).send(await getBanner(req.user));
  } catch (error) {
    logger.error('[getBanner] Error getting banner', error);
    res.status(500).json({ message: 'Error getting banner' });
  }
});

/**
 * GET /api/banner/list
 * Get all active banners for the current user
 */
router.get('/list', optionalJwtAuth, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isNaN(parsedLimit) ? 10 : Math.min(Math.max(parsedLimit, 1), 50);
    const banners = await getActiveBanners(req.user, { limit });
    res.status(200).json(banners);
  } catch (error) {
    logger.error('[getActiveBanners] Error getting banners', error);
    res.status(500).json({ message: 'Error getting banners' });
  }
});

module.exports = router;
