// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const client = require('openid-client');
const {
  checkBan,
  logHeaders,
  loginLimiter,
  setBalanceConfig,
  checkDomainAllowed,
} = require('~/server/middleware');
const { setAuthTokens, setOpenIDAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');
const { isEnabled } = require('~/server/utils');

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

const JWT_SECRET = process.env.JWT_SECRET || process.env.OPENID_SESSION_SECRET;

router.use(logHeaders);
router.use(loginLimiter);

const oauthHandler = async (req, res) => {
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    if (
      req.user &&
      req.user.provider == 'openid' &&
      isEnabled(process.env.OPENID_REUSE_TOKENS) === true
    ) {
      setOpenIDAuthTokens(req.user.tokenset, res);
    } else {
      await setAuthTokens(req.user._id, res);
    }
    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
  }
};

router.get('/error', (req, res) => {
  // A single error message is pushed by passport when authentication fails.
  logger.error('Error in OAuth authentication:', { message: req.session.messages.pop() });

  // Redirect to login page with auth_failed parameter to prevent infinite redirect loops
  res.redirect(`${domains.client}/login?redirect=false`);
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
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  setBalanceConfig,
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
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  setBalanceConfig,
  oauthHandler,
);

/**
 * OpenID Routes
 */
router.get('/openid', (req, res, next) => {
  const state = client.randomState();

  try {
    const stateToken = jwt.sign(
      {
        state: state,
        timestamp: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: '10m' },
    );

    res.cookie('oauth_state', stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      signed: false,
      maxAge: 10 * 60 * 1000,
      sameSite: 'lax',
    });
    passport.authenticate('openid', {
      session: false,
      state: state,
    })(req, res, next);
  } catch (error) {
    logger.error('Error creating state token for OpenID authentication', error);
    return res.redirect(`${domains.client}/oauth/error`);
  }
});

router.get(
  '/openid/callback',
  (req, res, next) => {
    if (!req.query.state) {
      logger.error('Missing state parameter in OpenID callback');
      return res.redirect(`${domains.client}/oauth/error`);
    }

    const stateToken = req.cookies.oauth_state;
    if (!stateToken) {
      logger.error('No state cookie found for OpenID callback');
      return res.redirect(`${domains.client}/oauth/error`);
    }

    try {
      const decodedState = jwt.verify(stateToken, JWT_SECRET);
      if (req.query.state !== decodedState.state) {
        logger.error('Invalid state parameter in OpenID callback', {
          received: req.query.state,
          expected: decodedState.state,
        });
        return res.redirect(`${domains.client}/oauth/error`);
      }
      res.clearCookie('oauth_state');
      passport.authenticate('openid', {
        failureRedirect: `${domains.client}/oauth/error`,
        failureMessage: true,
        session: false,
      })(req, res, next);
    } catch (error) {
      logger.error('Invalid or expired state token in OpenID callback', error);
      res.clearCookie('oauth_state');
      return res.redirect(`${domains.client}/oauth/error`);
    }
  },
  setBalanceConfig,
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
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  setBalanceConfig,
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
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/oauth/error`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  setBalanceConfig,
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
  oauthHandler,
);

module.exports = router;
