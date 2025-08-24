const express = require('express');
const endpointController = require('~/server/controllers/EndpointController');
const { configMiddleware } = require('~/server/middleware');

const router = express.Router();
router.get('/', configMiddleware, endpointController);

module.exports = router;
