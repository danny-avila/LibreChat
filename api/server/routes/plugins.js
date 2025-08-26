const express = require('express');
const { getAvailablePluginsController } = require('~/server/controllers/PluginController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.get('/', requireJwtAuth, getAvailablePluginsController);

module.exports = router;
