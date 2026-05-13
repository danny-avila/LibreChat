// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, createSetBalanceConfig } = require('@librechat/api');
const { checkDomainAllowed, loginLimiter, logHeaders, checkBan } = require('~/server/middleware');
const { syncUserEntraGroupMemberships } = require('~/server/services/PermissionService');
const { setAuthTokens, setOpenIDAuthTokens } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');
const { putExchange } = require('~/cache/nativeOAuthExchange');
const { Balance } = require('~/db/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(logHeaders);
router.use(loginLimiter);

/**
 * Native deep-link URL scheme the iOS/Android Capacitor apps register.
 * Matches the iOS Info.plist CFBundleURLSchemes entry and the Android
 * intent-filter we will add later.
 */
const NATIVE_REDIRECT_SCHEME = 'ai.codecan.app';
const NATIVE_REDIRECT_PATH = '/oauth/callback';
const OAUTH_PLATFORM_COOKIE = 'oauth_platform';
const OAUTH_PLATFORM_COOKIE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_NATIVE_PLATFORMS = new Set(['ios', 'android']);

const isProduction = process.env.NODE_ENV === 'production';

const buildNativeRedirect = (params) => {
  const url = new URL(`${NATIVE_REDIRECT_SCHEME}://${NATIVE_REDIRECT_PATH.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

/**
 * If the start route was hit with ?platform=ios|android, stash that on a
 * short-lived cookie so the success / failure handlers further along the
 * OAuth round trip can recognize the native caller and redirect into the
 * custom URL scheme instead of the web SPA.
 */
const markNativePlatform = (req, res, next) => {
  const platform = typeof req.query.platform === 'string' ? req.query.platform : null;
  if (platform && ALLOWED_NATIVE_PLATFORMS.has(platform)) {
    res.cookie(OAUTH_PLATFORM_COOKIE, platform, {
      maxAge: OAUTH_PLATFORM_COOKIE_TTL_MS,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });
  }
  next();
};

const clearPlatformCookie = (res) => {
  res.clearCookie(OAUTH_PLATFORM_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
  });
};

const oauthHandler = async (req, res, next) => {
  try {
    if (res.headersSent) {
      return;
    }

    await checkBan(req, res);
    if (req.banned) {
      return;
    }

    const nativePlatform = req.cookies?.[OAUTH_PLATFORM_COOKIE];
    const isNative = ALLOWED_NATIVE_PLATFORMS.has(nativePlatform);

    let token;
    let refreshToken = null;
    let refreshTokenExpires = null;

    if (
      req.user &&
      req.user.provider == 'openid' &&
      isEnabled(process.env.OPENID_REUSE_TOKENS) === true
    ) {
      await syncUserEntraGroupMemberships(req.user, req.user.tokenset.access_token);
      token = setOpenIDAuthTokens(req.user.tokenset, res, req.user._id.toString());
    } else {
      const result = await setAuthTokens(req.user._id, res, null, { returnRefresh: isNative });
      if (isNative && result && typeof result === 'object') {
        ({ token, refreshToken, refreshTokenExpires } = result);
      } else {
        token = result;
      }
    }

    if (isNative) {
      clearPlatformCookie(res);
      const exchangeCode = await putExchange({
        userId: req.user._id.toString(),
        token,
        refreshToken,
        refreshTokenExpires,
        provider: req.user.provider || null,
      });
      return res.redirect(buildNativeRedirect({ code: exchangeCode }));
    }

    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
    next(err);
  }
};

router.get('/error', (req, res) => {
  /** A single error message is pushed by passport when authentication fails. */
  const errorMessage = req.session?.messages?.pop() || 'Unknown error';
  logger.error('Error in OAuth authentication:', {
    message: errorMessage,
  });

  const nativePlatform = req.cookies?.[OAUTH_PLATFORM_COOKIE];
  if (ALLOWED_NATIVE_PLATFORMS.has(nativePlatform)) {
    clearPlatformCookie(res);
    return res.redirect(buildNativeRedirect({ error: ErrorTypes.AUTH_FAILED }));
  }

  res.redirect(`${domains.client}/login?redirect=false&error=${ErrorTypes.AUTH_FAILED}`);
});

/**
 * Google Routes
 */
router.get(
  '/google',
  markNativePlatform,
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * Facebook Routes
 */
router.get(
  '/facebook',
  markNativePlatform,
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * OpenID Routes
 */
router.get('/openid', markNativePlatform, (req, res, next) => {
  return passport.authenticate('openid', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/openid/callback',
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * GitHub Routes
 */
router.get(
  '/github',
  markNativePlatform,
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * Discord Routes
 */
router.get(
  '/discord',
  markNativePlatform,
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * Apple Routes
 */
router.get(
  '/apple',
  passport.authenticate('apple', {
    session: false,
  }),
);

router.post(
  '/apple/callback',
  passport.authenticate('apple', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * SAML Routes
 */
router.get(
  '/saml',
  passport.authenticate('saml', {
    session: false,
  }),
);

router.post(
  '/saml/callback',
  passport.authenticate('saml', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  oauthHandler,
);

module.exports = router;
