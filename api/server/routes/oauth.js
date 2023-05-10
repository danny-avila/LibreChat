const passport = require('passport');
const express = require('express');

const router = express.Router();
const COOKIE_NAME = 'token';
const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
const sessionExpiry = process.env.SESSION_EXPIRY || 3600000; // 1 hour
const isProduction = process.env.NODE_ENV === 'production';

const setCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    expires: new Date(Date.now() + sessionExpiry),
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
  });
};

const handleAuthCallback = (req, res) => {
  const token = req.user.generateToken();
  setCookie(res, token);
  res.redirect(clientUrl);
};

const handleAuthError = (err, req, res, next) => {
  res.status(401).json({ message: err.message });
};

// Social
const authenticate = (provider) => passport.authenticate(provider, {
  scope: ['openid', 'profile', 'email'],
  session: false,
});

router.get('/google', authenticate('google'));

router.get('/google/callback', 
  authenticate('google', {
    failureRedirect: `${clientUrl}/login`,
    failureMessage: true,
    scope: ['openid', 'profile', 'email'],
  }),
  handleAuthCallback,
);

router.get('/facebook', authenticate('facebook'));

router.get('/facebook/callback', 
  authenticate('facebook', {
    failureRedirect: `${clientUrl}/login`,
    failureMessage: true,
    scope: ['public_profile', 'email'],
  }),
  handleAuthCallback,
);

router.use(handleAuthError);

module.exports = router;
