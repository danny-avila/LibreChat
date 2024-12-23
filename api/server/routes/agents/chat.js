const express = require('express');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  setHeaders,
  handleAbort,
  // validateModel,
  generateCheckAccess,
  validateConvoAccess,
  buildEndpointOption,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');
const addTitle = require('~/server/services/Endpoints/agents/title');

const router = express.Router();

router.post('/abort', handleAbort());

const checkAgentAccess = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);

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
  checkAgentAccess,
  validateConvoAccess,
  buildEndpointOption,
  setHeaders,
  async (req, res, next) => {
    await AgentController(req, res, next, initializeClient, addTitle);
  },
);

module.exports = router;
