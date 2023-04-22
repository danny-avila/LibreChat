const Router = require('express').Router;
const passport = require('passport');

const router = Router();

router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile', 'email']
  })
);

const clientUrl =
  process.env.NODE_ENV === 'production' ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: '/',
    session: false
  }),
  (req, res) => {
    // console.log(req.user);
    const token = req.user.generateJWT();
    res.cookie('x-auth-cookie', token);
    res.redirect(clientUrl);
  }
);

module.exports = router;
