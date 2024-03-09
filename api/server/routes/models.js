const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const { setCurrentUser, requireSubscription } = require('~/server/middleware/');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const router = express.Router();
router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.get('/', modelController);

module.exports = router;
