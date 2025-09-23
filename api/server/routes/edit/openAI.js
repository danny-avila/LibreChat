const express = require('express');
const EditController = require('~/server/controllers/EditController');
const { initializeClient } = require('~/server/services/Endpoints/openAI');
const {
  setHeaders,
  validateModel,
  validateEndpoint,
  buildEndpointOption,
  moderateText,
  configMiddleware,
} = require('~/server/middleware');

const router = express.Router();
router.use(moderateText);

router.post(
  '/',
  (req, res, next) => {
    const { logger } = require('~/config');
    logger.warn('[OpenAI Route] Request received at /api/edit/openAI:', {
      endpoint: req.body.endpoint,
      endpointType: req.body.endpointType,
      model: req.body.model,
      path: req.path,
      originalUrl: req.originalUrl,
      WARNING: 'This should NOT be hit when using OpenRouter!',
    });
    next();
  },
  configMiddleware,
  validateEndpoint,
  validateModel,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    await EditController(req, res, next, initializeClient);
  },
);

module.exports = router;
