const passport = require('passport');
const express = require('express');
const router = express.Router();
const config = require('../../../config/loader');
const domains = config.domains;
const isProduction = config.isProduction;


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
    const token = req.user.generateToken();
    res.cookie('token', token, {
      expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
      httpOnly: false,
      secure: isProduction,
    });
    res.redirect(domains.client);
  },
);


module.exports = router;
