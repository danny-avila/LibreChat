// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware

const passport = require('passport');
const express = require('express');
const router = express.Router();
const { setAuthTokens } = require('~/server/services/AuthService');
const { loginLimiter, checkBan, checkDomainAllowed } = require('~/server/middleware');
const { logger } = require('~/config');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(loginLimiter);

const authenticate = (strategy, options) => {
  return (req, res, next) =>
    passport.authenticate(strategy, options, (err, user, info) => {
      if (err) {
        return next(err);
      }

      if (user) {
        req.user = user;
      }

      if (!user && info) {
        const message = info.message || info;
        if (typeof message === 'string') {
          return res.redirect(`${domains.client}/login?error=${message}`);
        }
      }

      next();
    })(req, res, next);
};

const oauthHandler = async (req, res) => {
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    await setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
  }
};

/**
 * Google Routes
 */
router.get(
  '/google',
  authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  authenticate('google', {
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  oauthHandler,
);

router.get(
  '/facebook',
  authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  authenticate('facebook', {
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  oauthHandler,
);

router.get(
  '/openid',
  authenticate('openid', {
    session: false,
  }),
);

router.get(
  '/openid/callback',
  authenticate('openid', {
    session: false,
  }),
  oauthHandler,
);

router.get(
  '/github',
  authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  authenticate('github', {
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  oauthHandler,
);

router.get(
  '/discord',
  authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  authenticate('discord', {
    session: false,
    scope: ['identify', 'email'],
  }),
  oauthHandler,
);

module.exports = router;
