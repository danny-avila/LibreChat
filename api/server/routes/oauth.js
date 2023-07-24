const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const { setAuthTokens } = require('../services/auth.service');
const domains = config.domains;
const isProduction = config.isProduction;

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
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  (req, res) => {
    setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  },
);

router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile', 'email'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['public_profile', 'email'],
  }),
  (req, res) => {
    setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  },
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
  (req, res) => {
    setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  },
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
  (req, res) => {
    setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  },
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
  (req, res) => {
    setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  },
);

module.exports = router;
