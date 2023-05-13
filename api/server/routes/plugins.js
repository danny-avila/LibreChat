const express = require('express');
const { getAvailableToolsController } = require('../controllers/PluginController');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

const router = express.Router();

// router.get('/', requireJwtAuth, getAvailableToolsController);
router.get('/', requireJwtAuth, getAvailableToolsController);

module.exports = router;
