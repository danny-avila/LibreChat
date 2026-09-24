// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { randomState } = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const {
  buildOAuthFailureLog,
  createOpenIDCallbackAuthenticator,
  createSetBalanceConfig,
  getOAuthFailureMessage,
  redirectToAuthFailure,
} = require('@librechat/api');
const {
  checkDomainAllowed,
  loginLimiter,
  logHeaders,
  markOAuthNavigation,
} = require('~/server/middleware');
const { createOAuthHandler } = require('~/server/controllers/auth/oauth');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

const authFailureRedirectOptions = {
  clientDomain: domains.client,
  authFailedError: ErrorTypes.AUTH_FAILED,
};

router.use(logHeaders);
/** Baseline IP rate limiter applied alongside the per-route login limiter. */
const routeRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150 });
router.use(routeRateLimiter);

const oauthHandler = createOAuthHandler();
const authenticateOpenIDCallback = createOpenIDCallbackAuthenticator({
  passport,
  logger,
  ...authFailureRedirectOptions,
});

router.get('/error', (req, res) => {
  /** A single error message is pushed by passport when authentication fails. */
  const errorMessage = getOAuthFailureMessage(req);
  logger.warn(
    '[OAuth] Authentication failed',
    buildOAuthFailureLog({
      provider: 'unknown',
      req,
      info: { message: errorMessage },
      defaultMessage: errorMessage,
    }),
  );

  redirectToAuthFailure(res, authFailureRedirectOptions);
});

/**
 * Google Routes
 */
router.get(
  '/google',
  loginLimiter,
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  loginLimiter,
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/oauth/error`,
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
  loginLimiter,
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  loginLimiter,
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/oauth/error`,
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
router.get('/openid', loginLimiter, (req, res, next) => {
  return passport.authenticate('openid', {
    session: false,
    state: randomState(),
  })(req, res, next);
});

router.get(
  '/openid/callback',
  loginLimiter,
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
  loginLimiter,
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  loginLimiter,
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/oauth/error`,
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
  loginLimiter,
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  loginLimiter,
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/oauth/error`,
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
  loginLimiter,
  passport.authenticate('apple', {
    session: false,
  }),
);

router.post(
  '/apple/callback',
  loginLimiter,
  passport.authenticate('apple', {
    failureRedirect: `${domains.client}/oauth/error`,
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
  loginLimiter,
  passport.authenticate('saml', {
    session: false,
  }),
);

router.post(
  '/saml/callback',
  loginLimiter,
  passport.authenticate('saml', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
  }),
  oauthHandler,
);

module.exports = router;
