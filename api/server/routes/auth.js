const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  getUserController,
  loginController,
  logoutController,
  refreshController,
  registrationController,
} = require('../controllers/auth.controller');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const requireLocalAuth = require('../../middleware/requireLocalAuth');
const passport = require('passport');

const router = express.Router();

const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = isProduction ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;

//Local
router.get('/user', requireJwtAuth, getUserController);
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', requireLocalAuth, loginController);
router.post('/refresh', requireJwtAuth, refreshController);
router.post('/register', registrationController);
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

// Social
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
    failureRedirect: `${clientUrl}/login`,
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
    res.redirect(clientUrl);
  }
);

module.exports = router;
