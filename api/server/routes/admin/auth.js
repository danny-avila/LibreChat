const express = require('express');
const passport = require('passport');
const crypto = require('node:crypto');
const { CacheKeys } = require('librechat-data-provider');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const {
  getAdminPanelUrl,
  exchangeAdminCode,
  createSetBalanceConfig,
  storeAndStripChallenge,
  tenantContextMiddleware,
} = require('@librechat/api');
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
  tenantContextMiddleware,
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

/**
 * Generates a random hex state string for OAuth flows.
 * @returns {string} A 32-byte random hex string.
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to retrieve PKCE challenge from cache using the OAuth state.
 * Reads state from req.oauthState (set by a preceding middleware).
 * @param {string} provider - Provider name for logging.
 * @returns {Function} Express middleware.
 */
function retrievePkceChallenge(provider) {
  return async (req, res, next) => {
    if (!req.oauthState) {
      return next();
    }
    try {
      const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
      const challenge = await cache.get(`pkce:${req.oauthState}`);
      if (challenge) {
        req.pkceChallenge = challenge;
        await cache.delete(`pkce:${req.oauthState}`);
      } else {
        logger.warn(
          `[admin/oauth/${provider}/callback] State present but no PKCE challenge found; PKCE will not be enforced for this request`,
        );
      }
    } catch (err) {
      logger.error(
        `[admin/oauth/${provider}/callback] Failed to retrieve PKCE challenge, aborting:`,
        err,
      );
      return res.redirect(
        `${getAdminPanelUrl()}/auth/${provider}/callback?error=pkce_retrieval_failed&error_description=Failed+to+retrieve+PKCE+challenge`,
      );
    }
    next();
  };
}

/* ──────────────────────────────────────────────
 * OpenID Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/openid', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'openid');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/openid/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('openidAdmin', {
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/openid/callback',
  (req, res, next) => {
    req.oauthState = typeof req.query.state === 'string' ? req.query.state : undefined;
    next();
  },
  passport.authenticate('openidAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/openid/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('openid'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/openid/callback`),
);

/* ──────────────────────────────────────────────
 * SAML Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/saml', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'saml');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/saml/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('samlAdmin', {
    session: false,
    additionalParams: { RelayState: state },
  })(req, res, next);
});

router.post(
  '/oauth/saml/callback',
  (req, res, next) => {
    req.oauthState = typeof req.body.RelayState === 'string' ? req.body.RelayState : undefined;
    next();
  },
  passport.authenticate('samlAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/saml/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('saml'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/saml/callback`),
);

/* ──────────────────────────────────────────────
 * Google Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/google', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'google');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/google/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('googleAdmin', {
    scope: ['openid', 'profile', 'email'],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/google/callback',
  (req, res, next) => {
    req.oauthState = typeof req.query.state === 'string' ? req.query.state : undefined;
    next();
  },
  passport.authenticate('googleAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/google/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('google'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/google/callback`),
);

/* ──────────────────────────────────────────────
 * GitHub Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/github', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'github');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/github/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('githubAdmin', {
    scope: ['user:email', 'read:user'],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/github/callback',
  (req, res, next) => {
    req.oauthState = typeof req.query.state === 'string' ? req.query.state : undefined;
    next();
  },
  passport.authenticate('githubAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/github/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('github'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/github/callback`),
);

/* ──────────────────────────────────────────────
 * Discord Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/discord', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'discord');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/discord/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('discordAdmin', {
    scope: ['identify', 'email'],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/discord/callback',
  (req, res, next) => {
    req.oauthState = typeof req.query.state === 'string' ? req.query.state : undefined;
    next();
  },
  passport.authenticate('discordAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/discord/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('discord'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/discord/callback`),
);

/* ──────────────────────────────────────────────
 * Facebook Admin Routes
 * ────────────────────────────────────────────── */

router.get('/oauth/facebook', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'facebook');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/facebook/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('facebookAdmin', {
    scope: ['public_profile'],
    session: false,
    state,
  })(req, res, next);
});

router.get(
  '/oauth/facebook/callback',
  (req, res, next) => {
    req.oauthState = typeof req.query.state === 'string' ? req.query.state : undefined;
    next();
  },
  passport.authenticate('facebookAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/facebook/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('facebook'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/facebook/callback`),
);

/* ──────────────────────────────────────────────
 * Apple Admin Routes (POST callback)
 * ────────────────────────────────────────────── */

router.get('/oauth/apple', async (req, res, next) => {
  const state = generateState();
  const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
  const stored = await storeAndStripChallenge(cache, req, state, 'apple');
  if (!stored) {
    return res.redirect(
      `${getAdminPanelUrl()}/auth/apple/callback?error=pkce_store_failed&error_description=Failed+to+store+PKCE+challenge`,
    );
  }

  return passport.authenticate('appleAdmin', {
    session: false,
    state,
  })(req, res, next);
});

router.post(
  '/oauth/apple/callback',
  (req, res, next) => {
    req.oauthState = typeof req.body.state === 'string' ? req.body.state : undefined;
    next();
  },
  passport.authenticate('appleAdmin', {
    failureRedirect: `${getAdminPanelUrl()}/auth/apple/callback?error=auth_failed&error_description=Authentication+failed`,
    failureMessage: true,
    session: false,
  }),
  tenantContextMiddleware,
  retrievePkceChallenge('apple'),
  requireAdminAccess,
  setBalanceConfig,
  middleware.checkDomainAllowed,
  createOAuthHandler(`${getAdminPanelUrl()}/auth/apple/callback`),
);

/** Regex pattern for valid exchange codes: 64 hex characters */
const EXCHANGE_CODE_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Exchange OAuth authorization code for tokens.
 * This endpoint is called server-to-server by the admin panel.
 * The code is one-time-use and expires in 30 seconds.
 *
 * POST /api/admin/oauth/exchange
 * Body: { code: string, code_verifier?: string }
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
      (typeof codeVerifier !== 'string' || codeVerifier.length < 1 || codeVerifier.length > 512)
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
