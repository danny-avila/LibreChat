const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const { setAuthTokens } = require('../services/auth.service');
const Session = require('../../models/Session');
const domains = config.domains;

/**
 * Google Routes
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email']
  }),
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  }
);

router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile', 'email'],
    session: false
  })
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['public_profile', 'email']
  }),
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  }
);

router.get(
  '/openid',
  passport.authenticate('openid', {
    session: false
  })
);

router.get(
  '/openid/callback',
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false
  }),
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  }
);

router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false
  })
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user']
  }),
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  }
);

router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false
  })
);

router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email']
  }),
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  }
);

module.exports = router;
