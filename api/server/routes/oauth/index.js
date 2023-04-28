// const express = require('express');

const localAuth = require('./localAuth');
const googleAuth = require('./googleAuth');
const facebookAuth = require('./facebookAuth');

// const router = express.Router();

// router.use('/oauth', localAuthRoutes);
// router.use('/oauth', googleAuthRoutes);
// router.use('/oauth', facebookAuthRoutes);

// module.exports = router;

module.exports = {
  localAuth,
  googleAuth,
  facebookAuth
};

/*
routes:

GET /oauth/google
GET /oauth/google/callback

GET /oauth/facebook
GET /oauth/facebook/callback

POST /oauth/login
POST /oauth/register
GET /oauth/logout

GET api/users/me
GET /api/users/feature

*/
