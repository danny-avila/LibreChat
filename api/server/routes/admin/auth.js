const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const {
  requireAdmin,
  getAdminPanelUrl,
  exchangeAdminCode,
  createSetBalanceConfig,
} = require('@librechat/api');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');
const { getOpenIdConfig } = require('~/strategies');
const middleware = require('~/server/middleware');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();

router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth,
  requireAdmin,
  setBalanceConfig,
  loginController,
);

router.get('/verify', middleware.requireJwtAuth, requireAdmin, (req, res) => {
  const { password: _p, totpSecret: _t, __v, ...user } = req.user;
  user.id = user._id.toString();
  res.status(200).json({ user });
});

router.get('/oauth/openid/check', (req, res) => {
  const openidConfig = getOpenIdConfig();
  if (!openidConfig) {
    return res.status(404).json({
      error: 'OpenID configuration not found',
      error_code: 'OPENID_NOT_CONFIGURED',
    });
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
  requireAdmin,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/openid/callback`),
);

/** Regex pattern for valid exchange codes: 64 hex characters */
const EXCHANGE_CODE_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * Exchange OAuth authorization code for tokens.
 * This endpoint is called server-to-server by the admin panel.
 * The code is one-time-use and expires in 30 seconds.
 *
 * POST /api/admin/oauth/exchange
 * Body: { code: string }
 * Response: { token: string, refreshToken: string, user: object }
 */
router.post('/oauth/exchange', middleware.loginLimiter, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      logger.warn('[admin/oauth/exchange] Missing authorization code');
      return res.status(400).json({
        error: 'Missing authorization code',
        error_code: 'MISSING_CODE',
      });
    }

    if (typeof code !== 'string' || !EXCHANGE_CODE_PATTERN.test(code)) {
      logger.warn('[admin/oauth/exchange] Invalid authorization code format');
      return res.status(400).json({
        error: 'Invalid authorization code format',
        error_code: 'INVALID_CODE_FORMAT',
      });
    }

    const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    const result = await exchangeAdminCode(cache, code);

    if (!result) {
      return res.status(401).json({
        error: 'Invalid or expired authorization code',
        error_code: 'INVALID_OR_EXPIRED_CODE',
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('[admin/oauth/exchange] Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = router;
