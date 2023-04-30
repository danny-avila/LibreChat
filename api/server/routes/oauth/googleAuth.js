const express = require('express');
const passport = require('passport');

const router = express.Router();

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false
  })
);
const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = isProduction ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${clientUrl}/login`,
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
    res.redirect(clientUrl);
  }
);

module.exports = router;
