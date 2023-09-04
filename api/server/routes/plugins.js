const express = require('express');
const { getAvailablePluginsController } = require('../controllers/PluginController');
const requireJwtAuth = require('../middleware/requireJwtAuth');

const router = express.Router();

router.get('/', requireJwtAuth, getAvailablePluginsController);

module.exports = router;
