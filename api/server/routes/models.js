const express = require('express');
const router = express.Router();
const modelController = require('../controllers/ModelController');
const { requireJwtAuth } = require('../middleware');

router.get('/', requireJwtAuth, modelController);

module.exports = router;
