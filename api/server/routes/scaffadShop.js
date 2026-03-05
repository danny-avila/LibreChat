const express = require('express');
const jwt = require('jsonwebtoken');
const { issueScaffadShopTicket } = require('../utils/scaffadShopTicket');
const Profile = require('../models/Profile');

const router = express.Router();

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

    // Derive user from JWT passed in ?token=... (LibreChat auth JWT)
    const rawToken = req.query.token;
    if (!rawToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing auth token. Please log in via LibreChat.',
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        error: 'Config error',
        message: 'JWT_SECRET is not configured',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(rawToken, secret);
    } catch (e) {
      console.error('[scaffadShop] Invalid auth token:', e.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid auth token',
      });
    }

    const user = {
      id: decoded.id || decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.username || decoded.email,
      role: decoded.role,
    };

    // Load profile to determine role if available
    let profile = null;
    try {
      profile = await Profile.findOne({ userId: user.id }).lean();
    } catch (e) {
      // Non-fatal: we can still issue a ticket with user.role
      console.warn('[scaffadShop] Failed to load profile for user', user.id, e.message);
    }

    const ticket = issueScaffadShopTicket(user, profile);

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

