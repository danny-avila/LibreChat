const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const endpointController = require('~/server/controllers/EndpointController');
const tokenConfigController = require('~/server/controllers/TokenConfigController');

const router = express.Router();
/** Auth required for role/tenant-scoped endpoint config resolution. */
router.get('/', requireJwtAuth, endpointController);
router.get('/token-config', requireJwtAuth, tokenConfigController);

module.exports = router;
