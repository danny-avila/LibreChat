const express = require('express');
const { getAvailablePluginsController } = require('~/server/controllers/PluginController');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();

router.use(configMiddleware);
router.get('/', requireJwtAuth, getAvailablePluginsController);

module.exports = router;
