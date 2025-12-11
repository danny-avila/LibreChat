const express = require('express');
const { isEnabled, GenerationJobManager } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
  messageIpLimiter,
  configMiddleware,
  concurrentLimiter,
  messageUserLimiter,
} = require('~/server/middleware');
const { v1 } = require('./v1');
const chat = require('./chat');

const { LIMIT_CONCURRENT_MESSAGES, LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

router.use('/', v1);

/**
 * Stream endpoints - mounted before chatRouter to bypass rate limiters
 * These are GET requests and don't need message body validation or rate limiting
 */

/**
 * @route GET /chat/stream/:streamId
 * @desc Subscribe to an ongoing generation job's SSE stream with replay support
 * @access Private
 * @description Sends sync event with resume state, replays missed chunks, then streams live
 * @query resume=true - Indicates this is a reconnection (sends sync event)
 */
router.get('/chat/stream/:streamId', (req, res) => {
  const { streamId } = req.params;
  const isResume = req.query.resume === 'true';

  const job = GenerationJobManager.getJob(streamId);
  if (!job) {
    return res.status(404).json({
      error: 'Stream not found',
      message: 'The generation job does not exist or has expired.',
    });
  }

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  logger.debug(`[AgentStream] Client subscribed to ${streamId}, resume: ${isResume}`);

  // Send sync event with resume state for reconnecting clients
  if (isResume && !GenerationJobManager.wasSyncSent(streamId)) {
    const resumeState = GenerationJobManager.getResumeState(streamId);
    if (resumeState && !res.writableEnded) {
      res.write(`event: message\ndata: ${JSON.stringify({ sync: true, resumeState })}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
      GenerationJobManager.markSyncSent(streamId);
      logger.debug(
        `[AgentStream] Sent sync event for ${streamId} with ${resumeState.runSteps.length} run steps`,
      );
    }
  }

  const result = GenerationJobManager.subscribe(
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

  if (!result) {
    return res.status(404).json({ error: 'Failed to subscribe to stream' });
  }

  req.on('close', () => {
    logger.debug(`[AgentStream] Client disconnected from ${streamId}`);
    result.unsubscribe();
  });
});

/**
 * @route GET /chat/status/:conversationId
 * @desc Check if there's an active generation job for a conversation
 * @access Private
 * @returns { active, streamId, status, chunkCount, aggregatedContent, createdAt, resumeState }
 */
router.get('/chat/status/:conversationId', (req, res) => {
  const { conversationId } = req.params;

  const job = GenerationJobManager.getJobByConversation(conversationId);

  if (!job) {
    return res.json({ active: false });
  }

  if (job.metadata.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const info = GenerationJobManager.getStreamInfo(job.streamId);
  const resumeState = GenerationJobManager.getResumeState(job.streamId);

  res.json({
    active: info?.active ?? false,
    streamId: job.streamId,
    status: info?.status ?? job.status,
    chunkCount: info?.chunkCount ?? 0,
    runStepCount: info?.runStepCount ?? 0,
    aggregatedContent: info?.aggregatedContent,
    createdAt: info?.createdAt ?? job.createdAt,
    resumeState,
  });
});

/**
 * @route POST /chat/abort
 * @desc Abort an ongoing generation job
 * @access Private
 * @description Mounted before chatRouter to bypass buildEndpointOption middleware
 */
router.post('/chat/abort', (req, res) => {
  logger.debug(`[AgentStream] ========== ABORT ENDPOINT HIT ==========`);
  logger.debug(`[AgentStream] Method: ${req.method}, Path: ${req.path}`);
  logger.debug(`[AgentStream] Body:`, req.body);

  const { streamId, abortKey } = req.body;

  const jobStreamId = streamId || abortKey?.split(':')?.[0];
  logger.debug(`[AgentStream] Computed jobStreamId: ${jobStreamId}`);

  if (jobStreamId && GenerationJobManager.hasJob(jobStreamId)) {
    logger.debug(`[AgentStream] Job found, aborting: ${jobStreamId}`);
    GenerationJobManager.abortJob(jobStreamId);
    logger.debug(`[AgentStream] Job aborted successfully: ${jobStreamId}`);
    return res.json({ success: true, aborted: jobStreamId });
  }

  logger.warn(`[AgentStream] Job not found for streamId: ${jobStreamId}`);
  return res.status(404).json({ error: 'Job not found', streamId: jobStreamId });
});

const chatRouter = express.Router();
chatRouter.use(configMiddleware);

if (isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
  chatRouter.use(concurrentLimiter);
}

if (isEnabled(LIMIT_MESSAGE_IP)) {
  chatRouter.use(messageIpLimiter);
}

if (isEnabled(LIMIT_MESSAGE_USER)) {
  chatRouter.use(messageUserLimiter);
}

chatRouter.use('/', chat);
router.use('/chat', chatRouter);

module.exports = router;
