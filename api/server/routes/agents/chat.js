const express = require('express');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  // validateModel,
  // validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');

router.post('/abort', handleAbort());

/**
 * @route POST /
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post(
  '/',
  // validateModel,
  // validateEndpoint,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    await AgentController(req, res, next, initializeClient);
  },
);

module.exports = router;
