const express = require('express');
const { generateCheckAccess, skipAgentCheck, GenerationJobManager } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const {
  setHeaders,
  moderateText,
  requireJwtAuth,
  // validateModel,
  validateConvoAccess,
  buildEndpointOption,
  canAccessAgentFromBody,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  skipCheck: skipAgentCheck,
  getRoleByName,
});
const checkAgentResourceAccess = canAccessAgentFromBody({
  requiredPermission: PermissionBits.VIEW,
});

router.use(moderateText);
router.use(checkAgentAccess);
router.use(checkAgentResourceAccess);
router.use(validateConvoAccess);
router.use(buildEndpointOption);
router.use(setHeaders);

/**
 * @route POST /abort
 * @desc Abort an ongoing generation job
 * @access Private
 */
router.post('/abort', (req, res) => {
  const { streamId, abortKey } = req.body;

  const jobStreamId = streamId || abortKey?.split(':')?.[0];

  if (jobStreamId && GenerationJobManager.hasJob(jobStreamId)) {
    GenerationJobManager.abortJob(jobStreamId);
    logger.debug(`[AgentStream] Job aborted: ${jobStreamId}`);
    return res.json({ success: true, aborted: jobStreamId });
  }

  res.status(404).json({ error: 'Job not found' });
});

const controller = async (req, res, next) => {
  await AgentController(req, res, next, initializeClient, addTitle);
};

/**
 * @route POST / (regular endpoint)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/', controller);

/**
 * @route POST /:endpoint (ephemeral agents)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/:endpoint', controller);

module.exports = router;
