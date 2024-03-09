const express = require('express');
const router = express.Router();
const controller = require('../controllers/Balance');
const { setCurrentUser, requireSubscription } = require('../middleware/');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.get('/', controller);

module.exports = router;
