const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const endpointController = require('~/server/controllers/EndpointController');

const router = express.Router();
/** Auth required for role/tenant-scoped endpoint config resolution. */
router.get('/', requireJwtAuth, endpointController);

module.exports = router;
