const express = require('express');
const router = express.Router();
const endpointsController = require('../controllers/EndpointsController');

router.get('/', endpointsController);

module.exports = router;
