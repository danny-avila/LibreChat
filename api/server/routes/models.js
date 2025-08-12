const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');

const router = express.Router();
router.get('/', modelController);

module.exports = router;
