const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const configMiddleware = require('~/server/middleware/config/app');
const endpointController = require('~/server/controllers/EndpointController');
const tokenConfigController = require('~/server/controllers/TokenConfigController');
const contextProjectionController = require('~/server/controllers/ContextProjectionController');
const { contextProjectionLimiter } = require('~/server/middleware/limiters');

const router = express.Router();
/** Auth required for role/tenant-scoped endpoint config resolution. */
router.get('/', requireJwtAuth, endpointController);
router.get('/token-config', requireJwtAuth, configMiddleware, tokenConfigController);
router.post(
  '/context-projection',
  requireJwtAuth,
  contextProjectionLimiter,
  configMiddleware,
  contextProjectionController,
);

module.exports = router;
