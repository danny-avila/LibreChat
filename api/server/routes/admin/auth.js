const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { getAdminPanelUrl, exchangeAdminCode, createSetBalanceConfig } = require('@librechat/api');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');
const { getOpenIdConfig } = require('~/strategies');
const middleware = require('~/server/middleware');

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();

function resolveRequestOrigin(req) {
  const originHeader = req.get('origin');
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return undefined;
    }
  }

  const refererHeader = req.get('referer');
  if (!refererHeader) {
    return undefined;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return undefined;
  }
}

router.post(
  '/login/local',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.requireLocalAuth,
  requireAdminAccess,
  setBalanceConfig,
  loginController,
);

router.get('/verify', middleware.requireJwtAuth, requireAdminAccess, (req, res) => {
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

/** PKCE challenge cache TTL: 5 minutes (enough for user to authenticate with IdP) */
const PKCE_CHALLENGE_TTL = 5 * 60 * 1000;
/** Regex pattern for valid PKCE challenges: 64 hex characters (SHA-256 hex digest) */
const PKCE_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;

router.get('/oauth/openid', async (req, res, next) => {
  const state = randomState();
  const codeChallenge = req.query.code_challenge;

  if (typeof codeChallenge === 'string' && PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    try {
      const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
      await cache.set(`pkce:${state}`, codeChallenge, PKCE_CHALLENGE_TTL);
    } catch (err) {
      logger.error('[admin/oauth/openid] Failed to store PKCE challenge:', err);
      return res.redirect(
        `${getAdminPanelUrl()}/auth/openid/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
      );
    }
  }

  return passport.authenticate('openidAdmin', {
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/openid/callback',
  /** Capture OAuth state before passport consumes the query params */
  (req, res, next) => {
    req.oauthState = req.query.state;
    next();
  },
  passport.authenticate('openidAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/openid/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  /** Retrieve PKCE challenge from cache using the OAuth state */
  async (req, res, next) => {
    if (!req.oauthState) {
      return next();
    }
    try {
      const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
      const challenge = await cache.get(`pkce:${req.oauthState}`);
      if (challenge) {
        req.pkceChallenge = challenge;
        await cache.delete(`pkce:${req.oauthState}`);
      }
    } catch (err) {
      logger.error('[admin/oauth/callback] Failed to retrieve PKCE challenge, aborting:', err);
      return res.redirect(
        `${getAdminPanelUrl()}/auth/openid/callback?error=pkce_retrieval_failed&error_description=Failed+to+retrieve+PKCE+challenge`,
      );
    }
    next();
  },
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/openid/callback`),
);

/** Regex pattern for valid exchange codes: 64 hex characters */
const EXCHANGE_CODE_PATTERN = /^[a-f0-9]{64}$/;

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
    const { code, code_verifier: codeVerifier } = req.body;

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

    if (
      codeVerifier !== undefined &&
      (typeof codeVerifier !== 'string' || codeVerifier.length > 512)
    ) {
      logger.warn('[admin/oauth/exchange] Invalid code_verifier format');
      return res.status(400).json({
        error: 'Invalid code_verifier',
        error_code: 'INVALID_VERIFIER',
      });
    }

    const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    const requestOrigin = resolveRequestOrigin(req);
    const result = await exchangeAdminCode(cache, code, requestOrigin, codeVerifier);

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
