const express = require('express');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const { getUserController, updateUserPluginsController } = require('../controllers/UserController');
const { setCurrentUser, requireSubscription } = require('~/server/middleware');
const router = express.Router();
router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.get('/', getUserController);
router.post('/plugins', updateUserPluginsController);

module.exports = router;
