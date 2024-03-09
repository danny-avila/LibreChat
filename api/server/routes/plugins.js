const express = require('express');
const { getAvailablePluginsController } = require('../controllers/PluginController');
const { setCurrentUser, requireSubscription } = require('../middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const router = express.Router();
router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.get('/', getAvailablePluginsController);

module.exports = router;
