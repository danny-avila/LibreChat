// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { createSetBalanceConfig } = require('@librechat/api');
const { checkDomainAllowed, loginLimiter, logHeaders } = require('~/server/middleware');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { getAppConfig } = require('~/server/services/Config');
const { Balance } = require('~/models');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  Balance,
});

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

const createAuthCallbackHandler = (provider, options = {}) => {
  return (req, res, next) => {
    const auth = passport.authenticate(provider, { session: false, ...options });
    auth(req, res, (err) => {
      if (err || !req.user) {
        logger.error(`[${provider}Callback] OAuth authentication failed:`, err);
        const errorMsg = err?.message || `${provider} OAuth authentication failed`;
        return res.redirect(
          `${domains.client}/oauth/error?message=${encodeURIComponent(errorMsg)}`,
        );
      }
      next();
    });
  };
};

router.use(logHeaders);
router.use(loginLimiter);

const oauthHandler = createOAuthHandler();

router.get('/error', (req, res) => {
  /** A single error message is pushed by passport when authentication fails. */
  const errorMessage = req.session?.messages?.pop() || req.query?.message || 'Unknown OAuth error';
  const errorType = req.query?.error || ErrorTypes.AUTH_FAILED;
  logger.error('Error in OAuth authentication:', {
    message: errorMessage,
    query: req.query,
    params: req.params,
  });

  res.redirect(
    `${domains.client}/login?redirect=false&error=${errorType}&message=${encodeURIComponent(errorMessage)}`,
  );
});

/**
 * Google Routes
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  createAuthCallbackHandler('google', {
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
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  createAuthCallbackHandler('facebook', {
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
router.get('/openid', (req, res, next) => {
  return passport.authenticate('openid', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/openid/callback',
  createAuthCallbackHandler('openid'),
  setBalanceConfig,
  checkDomainAllowed,
  oauthHandler,
);

/**
 * GitHub Routes
 */
router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  createAuthCallbackHandler('github', {
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
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  createAuthCallbackHandler('discord', {
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
  createAuthCallbackHandler('apple'),
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

router.post('/saml/callback', createAuthCallbackHandler('saml'), oauthHandler);

module.exports = router;
