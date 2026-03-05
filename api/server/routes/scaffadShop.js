const express = require('express');
const { requireJwtAuth } = require('../middleware');
const { issueScaffadShopTicket } = require('../utils/scaffadShopTicket');
const Profile = require('../models/Profile');

const router = express.Router();

// All routes require a logged-in LibreChat user
router.use(requireJwtAuth);

/**
 * GET /scaffad/shop
 *
 * Generates a short-lived ticket JWT for the current user and redirects to
 * the Scaffad Shop with ?token=<ticket>.
 *
 * Optional query:
 *   redirect_uri  - override shop base URL (must be a full URL)
 */
router.get('/', async (req, res) => {
  try {
    const baseUrl = process.env.SCAFFAD_SHOP_BASE_URL;
    const redirectBase = req.query.redirect_uri || baseUrl;

    if (!redirectBase) {
      return res.status(500).json({
        error: 'Config error',
        message: 'SCAFFAD_SHOP_BASE_URL is not configured',
      });
    }

    // Load profile to determine role if available
    let profile = null;
    try {
      profile = await Profile.findOne({ userId: req.user.id }).lean();
    } catch (e) {
      // Non-fatal: we can still issue a ticket with user.role
      console.warn('[scaffadShop] Failed to load profile for user', req.user.id, e.message);
    }

    const ticket = issueScaffadShopTicket(req.user, profile);

    const url = new URL(redirectBase);
    url.searchParams.set('token', ticket);

    return res.redirect(302, url.toString());
  } catch (error) {
    console.error('[scaffadShop] Error generating ticket:', error);
    return res.status(500).json({
      error: 'TicketError',
      message: error.message || 'Failed to generate shop ticket',
    });
  }
});

module.exports = router;

