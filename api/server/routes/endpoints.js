const express = require('express');
const endpointController = require('~/server/controllers/EndpointController');

const router = express.Router();
router.get('/', endpointController);

module.exports = router;
