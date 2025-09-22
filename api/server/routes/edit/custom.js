const express = require('express');
const EditController = require('~/server/controllers/EditController');
const { initializeClient } = require('~/server/services/Endpoints/custom');
const { addTitle } = require('~/server/services/Endpoints/openAI');
const {
  handleAbort,
  setHeaders,
  validateModel,
  validateEndpoint,
  buildEndpointOption,
  configMiddleware,
} = require('~/server/middleware');

const router = express.Router();

router.post(
  '/',
  configMiddleware,
  validateEndpoint,
  validateModel,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    await EditController(req, res, next, initializeClient, addTitle);
  },
);

module.exports = router;
