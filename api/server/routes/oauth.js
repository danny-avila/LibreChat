const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const domains = config.domains;
const isProduction = config.isProduction;

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
  (req, res) => {
    const token = req.user.generateToken();
    res.cookie('token', token, {
      expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
      httpOnly: false,
      secure: isProduction
    });
    res.redirect(domains.client);
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
  (req, res) => {
    const token = req.user.generateToken();
    res.cookie('token', token, {
      expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
      httpOnly: false,
      secure: isProduction
    });
    res.redirect(domains.client);
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
  (req, res) => {
    const token = req.user.generateToken();
    res.cookie('token', token, {
      expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
      httpOnly: false,
      secure: isProduction
    });
    res.redirect(domains.client);
  }
);

module.exports = router;
