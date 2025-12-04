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

router.use(moderateText);

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  skipCheck: skipAgentCheck,
  getRoleByName,
});
const checkAgentResourceAccess = canAccessAgentFromBody({
  requiredPermission: PermissionBits.VIEW,
});

/**
 * @route GET /stream/:streamId
 * @desc Subscribe to an ongoing generation job's SSE stream
 * @access Private
 */
router.get('/stream/:streamId', requireJwtAuth, (req, res) => {
  const { streamId } = req.params;

  const job = GenerationJobManager.getJob(streamId);
  if (!job) {
    return res.status(404).json({
      error: 'Stream not found',
      message: 'The generation job does not exist or has expired.',
    });
  }

  // Disable compression for SSE
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  logger.debug(`[AgentStream] Client subscribed to ${streamId}`);

  const unsubscribe = GenerationJobManager.subscribe(
    streamId,
    (event) => {
      if (!res.writableEnded) {
        res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
      }
    },
    (event) => {
      if (!res.writableEnded) {
        res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
        res.end();
      }
    },
    (error) => {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error })}\n\n`);
        if (typeof res.flush === 'function') {
          res.flush();
        }
        res.end();
      }
    },
  );

  if (!unsubscribe) {
    return res.status(404).json({ error: 'Failed to subscribe to stream' });
  }

  if (job.status === 'complete' || job.status === 'error' || job.status === 'aborted') {
    res.write(`event: message\ndata: ${JSON.stringify({ final: true, status: job.status })}\n\n`);
    res.end();
    return;
  }

  req.on('close', () => {
    logger.debug(`[AgentStream] Client disconnected from ${streamId}`);
    unsubscribe();
  });
});

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

router.use(checkAgentAccess);
router.use(checkAgentResourceAccess);
router.use(validateConvoAccess);
router.use(buildEndpointOption);
router.use(setHeaders);

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
