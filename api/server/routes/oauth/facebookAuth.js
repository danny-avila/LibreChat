const Router = require('express').Router;
const passport = require('passport');

const router = Router();

router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile', 'email'],
    session: false
  })
);
const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = isProduction ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;

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
