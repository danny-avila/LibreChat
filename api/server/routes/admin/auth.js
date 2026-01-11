const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createSetBalanceConfig, exchangeAdminCode } = require('@librechat/api');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { getAppConfig } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');
const { getOpenIdConfig } = require('~/strategies');
const middleware = require('~/server/middleware');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

const getAdminPanelUrl = () => process.env.ADMIN_PANEL_URL || 'http://localhost:3000';

router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth,
  middleware.requireAdmin,
  setBalanceConfig,
  loginController,
);

router.get('/verify', middleware.requireJwtAuth, middleware.requireAdmin, (req, res) => {
  const { password: _p, totpSecret: _t, __v, ...user } = req.user;
  user.id = user._id.toString();
  res.status(200).json({ user });
});

router.get('/oauth/openid/check', (req, res) => {
  const openidConfig = getOpenIdConfig();
  if (!openidConfig) {
    return res.status(404).json({ message: 'OpenID configuration not found' });
  }
  res.status(200).json({ message: 'OpenID check successful' });
});

router.get('/oauth/openid', (req, res, next) => {
  return passport.authenticate('openidAdmin', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/oauth/openid/callback',
  passport.authenticate('openidAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/openid/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  middleware.requireAdmin,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/openid/callback`),
);

/**
 * Exchange OAuth authorization code for tokens.
 * This endpoint is called server-to-server by the admin panel.
 * The code is one-time-use and expires in 30 seconds.
 *
 * POST /api/admin/oauth/exchange
 * Body: { code: string }
 * Response: { token: string, refreshToken: string, user: object }
 */
router.post('/oauth/exchange', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      logger.warn('[admin/oauth/exchange] Missing authorization code');
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    const result = await exchangeAdminCode(cache, code);

    if (!result) {
      return res.status(401).json({ error: 'Invalid or expired authorization code' });
    }

    res.json(result);
  } catch (error) {
    logger.error('[admin/oauth/exchange] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
