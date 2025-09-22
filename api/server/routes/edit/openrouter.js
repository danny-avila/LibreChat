const express = require('express');
const EditController = require('~/server/controllers/EditController');
const initializeClient = require('~/server/services/Endpoints/openrouter/initialize');
const {
  setHeaders,
  validateModel,
  validateEndpoint,
  buildEndpointOption,
  configMiddleware,
} = require('~/server/middleware');

const router = express.Router();

router.post('/abort', EditController);

router.post(
  '/',
  (req, res, next) => {
    const { logger } = require('~/config');
    logger.info('[OpenRouter Route] Request received at /api/edit/openrouter:', {
      endpoint: req.body.endpoint,
      endpointType: req.body.endpointType,
      model: req.body.model,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
    });
    next();
  },
  configMiddleware,
  validateEndpoint,
  validateModel,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    const { logger } = require('~/config');
    logger.info('[OpenRouter Route] Passing to EditController with initializeClient');
    await EditController(req, res, next, initializeClient);
  },
);

module.exports = router;
