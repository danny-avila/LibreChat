const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const { setAuthTokens } = require('../services/AuthService');
const { loginLimiter, checkBan } = require('../middleware');
const domains = config.domains;

router.use(loginLimiter);

const oauthHandler = async (req, res) => {
  try {
    await checkBan(req, res);
    if (req.banned) {
      return;
    }
    await setAuthTokens(req.user._id, res);
    res.redirect(domains.client);
  } catch (err) {
    console.error('Error in setting authentication tokens:', err);
  }
};

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

module.exports = router;
