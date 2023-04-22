const express = require('express');
const localAuthRoutes = require('./localAuth');
const googleAuthRoutes = require('./googleAuth');
const facebookAuthRoutes = require('./facebookAuth');

const router = express.Router();

router.use('/oauth', localAuthRoutes);
router.use('/oauth', googleAuthRoutes);
router.use('/oauth', facebookAuthRoutes);

module.exports = router;

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

*/
