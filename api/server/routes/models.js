const express = require('express');
const router = express.Router();
const modelController = require('../controllers/ModelController');

router.get('/', modelController);

module.exports = router;
