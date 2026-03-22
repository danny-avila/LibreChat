const express = require('express');
const { isEnabled, GenerationJobManager, getToolCatalog, getSkills } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  messageIpLimiter,
  configMiddleware,
  messageUserLimiter,
} = require('~/server/middleware');
const { saveMessage } = require('~/models');
const chat = require('./chat');

const { LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

/**
 * @route GET /chat/stream/:streamId
 * @desc Subscribe to an OpenClaw generation SSE stream
 * @access Private
 */
router.get('/chat/stream/:streamId', async (req, res) => {
  const { streamId } = req.params;
  const isResume = req.query.resume === 'true';

  const job = await GenerationJobManager.getJob(streamId);
  if (!job) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  if (job.metadata?.userId && job.metadata.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeEvent = (event) => {
    if (!res.writableEnded) {
      res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    }
  };

  const onDone = (event) => {
    writeEvent(event);
    res.end();
  };

  const onError = (error) => {
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error })}\n\n`);
      if (typeof res.flush === 'function') res.flush();
      res.end();
    }
  };

  let result;
  if (isResume) {
    const { subscription, resumeState, pendingEvents } =
      await GenerationJobManager.subscribeWithResume(streamId, writeEvent, onDone, onError);

    if (!res.writableEnded && resumeState) {
      res.write(
        `event: message\ndata: ${JSON.stringify({ sync: true, resumeState, pendingEvents })}\n\n`,
      );
      if (typeof res.flush === 'function') res.flush();
      GenerationJobManager.markSyncSent(streamId);
    }
    result = subscription;
  } else {
    result = await GenerationJobManager.subscribe(streamId, writeEvent, onDone, onError);
  }

  if (!result) {
    return res.status(404).json({ error: 'Failed to subscribe to stream' });
  }

  req.on('close', () => result.unsubscribe());
});

/**
 * @route POST /chat/abort
 * @desc Abort an ongoing OpenClaw generation job
 * @access Private
 */
router.post('/chat/abort', async (req, res) => {
  const { streamId, conversationId } = req.body;
  const userId = req.user?.id;

  const jobStreamId = streamId || (conversationId !== 'new' ? conversationId : null);
  const job = jobStreamId ? await GenerationJobManager.getJob(jobStreamId) : null;

  if (job && jobStreamId) {
    if (job.metadata?.userId && job.metadata.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const abortResult = await GenerationJobManager.abortJob(jobStreamId);

    if (
      abortResult.success &&
      abortResult.jobData?.userMessage?.messageId &&
      abortResult.jobData?.responseMessageId
    ) {
      const { jobData, content, text } = abortResult;
      try {
        await saveMessage(req, {
          messageId: jobData.responseMessageId,
          parentMessageId: jobData.userMessage.messageId,
          conversationId: jobData.conversationId,
          content: content || [],
          text: text || '',
          sender: 'OpenClaw',
          endpoint: 'openclaw',
          model: jobData.model,
          unfinished: true,
          error: false,
          isCreatedByUser: false,
          user: userId,
        });
      } catch (err) {
        logger.error('[OpenClaw] Failed to save partial response on abort', err);
      }
    }

    return res.json({ success: true, aborted: jobStreamId });
  }

  return res.status(404).json({ error: 'Job not found', streamId: jobStreamId });
});

/** Resolve gateway config from app config for info endpoints */
function getGatewayConfig(req) {
  const appConfig = req.config;
  const endpointConfigs = appConfig?.endpoints?.custom ?? [];
  const cfg = endpointConfigs.find(
    (e) => e.name?.toLowerCase() === 'openclaw',
  );
  return {
    gatewayUrl: cfg?.baseURL ?? 'ws://127.0.0.1:18789',
    apiKey: cfg?.apiKey ?? '',
  };
}

/**
 * @route GET /tools
 * @desc List OpenClaw tool catalog
 * @access Private
 */
router.get('/tools', async (req, res) => {
  const { gatewayUrl, apiKey } = getGatewayConfig(req);
  const tools = await getToolCatalog(gatewayUrl, apiKey);
  res.json({ tools });
});

/**
 * @route GET /skills
 * @desc List available OpenClaw skills
 * @access Private
 */
router.get('/skills', async (req, res) => {
  const { gatewayUrl, apiKey } = getGatewayConfig(req);
  const skills = await getSkills(gatewayUrl, apiKey);
  res.json({ skills });
});

/**
 * @route GET /models
 * @desc List available OpenClaw models
 * @access Private
 */
router.get('/models', async (req, res) => {
  const { gatewayUrl, apiKey } = getGatewayConfig(req);
  try {
    const { gatewayManager } = require('@librechat/api');
    const client = await gatewayManager.getClient(gatewayUrl, apiKey);
    const models = await client.modelsList();
    res.json({ models });
  } catch (err) {
    logger.warn('[OpenClaw] Failed to list models', err);
    res.json({ models: [] });
  }
});

/**
 * @route POST /models/switch
 * @desc Switch OpenClaw model for a session
 * @access Private
 */
router.post('/models/switch', async (req, res) => {
  const { model, sessionKey } = req.body;
  const { gatewayUrl, apiKey } = getGatewayConfig(req);
  try {
    const { gatewayManager } = require('@librechat/api');
    const client = await gatewayManager.getClient(gatewayUrl, apiKey);
    await client.sessionsPatch({ sessionKey, model });
    await client.modelsChoice({ model });
    res.json({ success: true });
  } catch (err) {
    logger.warn('[OpenClaw] Failed to switch model', err);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

const chatRouter = express.Router();
chatRouter.use(configMiddleware);

if (isEnabled(LIMIT_MESSAGE_IP)) chatRouter.use(messageIpLimiter);
if (isEnabled(LIMIT_MESSAGE_USER)) chatRouter.use(messageUserLimiter);

chatRouter.use('/', chat);
router.use('/chat', chatRouter);

module.exports = router;
