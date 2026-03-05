const express = require('express');
const { issueScaffadShopTicket } = require('../utils/scaffadShopTicket');
const Profile = require('../models/Profile');
const { findUser } = require('~/models');
const { comparePassword } = require('~/models');
const middleware = require('~/server/middleware');

const router = express.Router();

/**
 * POST /api/auth/scaffad/ticket (or POST /auth/scaffad/ticket)
 *
 * For the Scaffad shop's own login page: shop sends email + password here,
 * LibreChat validates (same as main login) and returns a ticket JWT. No redirect.
 * Shop then calls its own POST /api/auth/exchange-ticket with that ticket to get
 * the shop session. User stays on the shop the whole time.
 */
router.post('/ticket', middleware.loginLimiter, async (req, res) => {
  try {
    const email = (req.body?.email || req.body?.username || '').trim();
    const password = req.body?.password;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUser({ email }, '+password');
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await comparePassword(user, password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        error:
          'Two-factor authentication is enabled. Please log in via the main LibreChat app, then open the shop from there.',
      });
    }

    let profile = null;
    try {
      profile = await Profile.findOne({ userId: user._id }).lean();
    } catch (e) {
      console.warn('[scaffadAuth] Failed to load profile for user', user._id, e.message);
    }

    const userForTicket = {
      id: user._id.toString(),
      email: user.email,
      name: user.name || user.username || user.email,
      role: user.role,
    };
    const ticket = issueScaffadShopTicket(userForTicket, profile);

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error('[scaffadAuth] POST /ticket error:', error);
    return res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

module.exports = router;
