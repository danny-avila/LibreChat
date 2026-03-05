const express = require('express');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const { issueScaffadShopTicket } = require('../utils/scaffadShopTicket');
const Profile = require('../models/Profile');

const router = express.Router();

/**
 * GET /auth/scaffad
 *
 * Flow B: User starts at Scaffad Shop, clicks "Continue via LibreChat".
 * Shop sends them here with:
 *   /auth/scaffad?redirect_uri=<encoded-shop-url>
 *
 * Behavior:
 * - If user is NOT authenticated in LibreChat:
 *   - Redirect to /login with a redirect back to this endpoint.
 * - If user IS authenticated:
 *   - Issue ticket JWT (same format as /scaffad/shop).
 *   - Redirect to <redirect_uri>?token=<ticket>.
 */
router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    const redirectUri = req.query.redirect_uri;
    if (!redirectUri) {
      return res.status(400).json({
        error: 'Missing redirect_uri',
        message: 'redirect_uri query parameter is required',
      });
    }

    // If not logged in, send user to login with redirect back here
    if (!req.user || !req.user.id) {
      const returnTo = `/auth/scaffad?redirect_uri=${encodeURIComponent(redirectUri)}`;
      const loginUrl = `/login?redirect=${encodeURIComponent(returnTo)}`;
      return res.redirect(302, loginUrl);
    }

    // Load profile to determine role if available
    let profile = null;
    try {
      profile = await Profile.findOne({ userId: req.user.id }).lean();
    } catch (e) {
      console.warn('[scaffadAuth] Failed to load profile for user', req.user.id, e.message);
    }

    const ticket = issueScaffadShopTicket(req.user, profile);

    const url = new URL(redirectUri);
    url.searchParams.set('token', ticket);

    return res.redirect(302, url.toString());
  } catch (error) {
    console.error('[scaffadAuth] Error in Flow B:', error);
    return res.status(500).json({
      error: 'ScaffadAuthError',
      message: error.message || 'Failed to process Scaffad auth flow',
    });
  }
});

module.exports = router;

