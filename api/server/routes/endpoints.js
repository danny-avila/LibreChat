const express = require('express');
const router = express.Router();
const endpointController = require('../controllers/EndpointController');

router.get('/', endpointController);

module.exports = router;
