const express = require('express');
const endpointController = require('~/server/controllers/EndpointController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

// Require authentication to prevent unauthenticated endpoint/model enumeration
router.get('/', requireJwtAuth, endpointController);

module.exports = router;
