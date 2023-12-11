const express = require('express');
const AskController = require('~/server/controllers/AskController');
const { initializeClient } = require('~/server/services/Endpoints/anthropic');
const {
  setHeaders,
  handleAbort,
  validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');

const router = express.Router();

router.post('/abort', handleAbort());

router.post('/', validateEndpoint, buildEndpointOption, setHeaders, async (req, res, next) => {
  await AskController(req, res, next, initializeClient);
});

module.exports = router;
