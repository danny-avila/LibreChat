const express = require('express');
const AskController = require('~/server/controllers/AskController');
const { addTitle, initializeClient } = require('~/server/services/Endpoints/anthropic');
const {
  setHeaders,
  handleAbort,
  validateModel,
  validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');

const router = express.Router();

router.post(
  '/',
  validateEndpoint,
  validateModel,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    await AskController(req, res, next, initializeClient, addTitle);
  },
);

module.exports = router;
