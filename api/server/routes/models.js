const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();
router.get('/', requireJwtAuth, modelController);

module.exports = router;
