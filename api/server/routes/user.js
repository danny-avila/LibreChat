const express = require('express');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const { getUserController, updateUserPluginsController } = require('../controllers/UserController');
const { setCurrentUser } = require('~/server/middleware');
const router = express.Router();
router.use(ClerkExpressRequireAuth(), setCurrentUser);
router.get('/', getUserController);
router.post('/plugins', updateUserPluginsController);

module.exports = router;
