const express = require('express');
const { modelController, refreshModelsController } = require('~/server/controllers/ModelController');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware/');

const router = express.Router();
router.get('/', requireJwtAuth, modelController);
router.post('/refresh', requireJwtAuth, checkAdmin, refreshModelsController);

module.exports = router;
