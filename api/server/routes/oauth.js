const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const { setAuthTokens } = require('../services/AuthService');
const domains = config.domains;


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
  async (req, res) => {
    try {
      await setAuthTokens(req.user._id, res);
      res.redirect(domains.client);
    } catch (err) {
      console.error('Error in setting authentication tokens:', err);
    }
  },
);


module.exports = router;
