const express = require('express');
const router = express.Router();
const endpointController = require('~/server/controllers/EndpointController');

router.get('/', endpointController);

module.exports = router;
