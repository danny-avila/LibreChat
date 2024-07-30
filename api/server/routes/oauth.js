// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const { loginLimiter, checkBan, checkDomainAllowed } = require('~/server/middleware');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(loginLimiter);

const oauthHandler = async (req, res) => {
  console.log('=== oauthHandler === ', req);
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    await setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  } catch (err) {
    console.error('Error in setting authentication tokens:', err);
    logger.error('Error in setting authentication tokens:', err);
  }
};

/**
 * Google Routes
 */
router.get(
  '/  ',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  oauthHandler,
);

router.get(
  '/apple',
  (req, res) => {
    const CLIENT_ID = process.env.APPLE_CLIENT_ID;
    const scope = 'email name';
    const state = process.env.APPLE_KEY_ID;
    const redirectUri = process.env.APPLE_CALLBACK_URL;

    const authorizationUri = `https://appleid.apple.com/auth/authorize?response_type=code id_token&client_id=${CLIENT_ID}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_mode=form_post`;

    res.redirect(authorizationUri);
  },
);

router.get(
  '/apple/callback',
  async (req, res) => {
    const { code, id_token } = req.body;

    try {
      // Verify the id_token
      const applePublicKey = await axios.get('https://appleid.apple.com/auth/keys');
      const decoded = jwt.verify(id_token, applePublicKey.data, { algorithms: ['RS256'] });

      console.log('[apple callback]', decoded, code);

      // Code to handle user authentication and retrieval using the decoded information

      res.redirect('/');
    } catch (error) {
      console.error('Error:', error.message);
      res.redirect('/login');
    }
  },
);

// router.get(
//   '/apple',
//   passport.authenticate('apple'),
// );

// router.post(
//   '/apple/callback',
//   passport.authenticate('apple'),
//   oauthHandler,
// );

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
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  oauthHandler,
);

router.get(
  '/openid',
  passport.authenticate('openid', {
    session: false,
  }),
);

router.get(
  '/openid/callback',
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
  }),
  oauthHandler,
);

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
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  oauthHandler,
);
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
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  oauthHandler,
);

module.exports = router;
