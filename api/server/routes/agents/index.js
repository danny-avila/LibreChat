const express = require('express');
const {
  isEnabled,
  GenerationJobManager,
  hasPersistableAbortContent,
  buildAbortedResponseMetadata,
  isPendingActionStale,
  toClientPendingAction,
  isHITLEnabled,
  deleteAgentCheckpoint,
  attachAskUserQuestionArgs,
} = require('@librechat/api');
const { createSseStreamTelemetry } = require('@librechat/api/telemetry');
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
const responses = require('./responses');
const openai = require('./openai');
const { v1 } = require('./v1');
const chat = require('./chat');

const { LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

/** Untenanted jobs (pre-multi-tenancy) remain accessible if the userId check passes. */
function hasTenantMismatch(job, user) {
  return job.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

const router = express.Router();

/**
 * Open Responses API routes (API key authentication handled in route file)
 * Mounted at /agents/v1/responses (full path: /api/agents/v1/responses)
 * NOTE: Must be mounted BEFORE /v1 to avoid being caught by the less specific route
 * @see https://openresponses.org/specification
 */
router.use('/v1/responses', responses);

/**
 * OpenAI-compatible API routes (API key authentication handled in route file)
 * Mounted at /agents/v1 (full path: /api/agents/v1/chat/completions)
 */
router.use('/v1', openai);

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

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
router.get('/chat/stream/:streamId', async (req, res) => {
  const { streamId } = req.params;
  const isResume = req.query.resume === 'true';

  const job = await GenerationJobManager.getJob(streamId);
  if (!job) {
    return res.status(404).json({
      error: 'Stream not found',
      message: 'The generation job does not exist or has expired.',
    });
  }

  if (job.metadata?.userId && job.metadata.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (hasTenantMismatch(job, req.user)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const streamTelemetry = createSseStreamTelemetry({ req, res, streamId, isResume });

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  streamTelemetry.recordHeadersFlushed();

  logger.debug(`[AgentStream] Client subscribed to ${streamId}, resume: ${isResume}`);

  const writeEvent = (event, options = {}) => {
    if (!res.writableEnded) {
      const eventName = options.eventName ?? 'message';
      const payload = `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;
      res.write(payload);
      streamTelemetry.recordWrite(payload, { final: options.final });
      if (typeof res.flush === 'function') {
        res.flush();
      }
      return true;
    }

    return false;
  };

  const onDone = (event) => {
    streamTelemetry.recordFinalEventEmitted();
    writeEvent(event, { final: true });
    res.end();
  };

  const onError = (error) => {
    if (!res.writableEnded) {
      streamTelemetry.recordErrorEventEmitted();
      writeEvent({ error }, { eventName: 'error' });
      res.end();
    }
  };

  let result;

  if (isResume) {
    const { subscription, resumeState, pendingEvents } =
      await GenerationJobManager.subscribeWithResume(streamId, writeEvent, onDone, onError);

    if (!res.writableEnded) {
      if (resumeState) {
        writeEvent({ sync: true, resumeState, pendingEvents });
        GenerationJobManager.markSyncSent(streamId);
        logger.debug(
          `[AgentStream] Sent sync event for ${streamId} with ${resumeState.runSteps.length} run steps, ${pendingEvents.length} pending events`,
        );
      } else if (pendingEvents.length > 0) {
        for (const event of pendingEvents) {
          writeEvent(event);
        }
        logger.warn(
          `[AgentStream] Resume state null for ${streamId}, replayed ${pendingEvents.length} gap events directly`,
        );
      }
    }

    result = subscription;
  } else {
    result = await GenerationJobManager.subscribe(streamId, writeEvent, onDone, onError);
  }

  if (!result) {
    streamTelemetry.recordSubscribeFailed();
    onError('Failed to subscribe to stream');
    return;
  }

  req.on('close', () => {
    logger.debug(`[AgentStream] Client disconnected from ${streamId}`);
    result.unsubscribe();
  });
});

/**
 * @route GET /chat/active
 * @desc Get all active generation job IDs for the current user
 * @access Private
 * @returns { activeJobIds: string[] }
 */
router.get('/chat/active', async (req, res) => {
  const activeJobIds = await GenerationJobManager.getActiveJobIdsForUser(
    req.user.id,
    req.user.tenantId,
  );
  res.json({ activeJobIds });
});

/**
 * @route GET /chat/status/:conversationId
 * @desc Check if there's an active generation job for a conversation
 * @access Private
 * @returns { active, streamId, status, aggregatedContent, createdAt, resumeState }
 */
router.get('/chat/status/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  // streamId === conversationId, so we can use getJob directly
  const job = await GenerationJobManager.getJob(conversationId);

  if (!job) {
    return res.json({ active: false });
  }

  if (job.metadata.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (hasTenantMismatch(job, req.user)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Get resume state which contains aggregatedContent
  // Avoid calling both getStreamInfo and getResumeState (both fetch content)
  const resumeState = await GenerationJobManager.getResumeState(conversationId);
  // A job paused for human review is still active (consistent with /chat/active),
  // so the client resumes/subscribes rather than treating it as finished — but
  // only while it has a live, resolvable prompt: a missing/malformed or
  // past-expiry pendingAction reads as inactive (cleanup/expiry will finalize it).
  const pendingAction = job.metadata.pendingAction;
  const pendingLive = job.status === 'requires_action' && !isPendingActionStale({ pendingAction });
  const isActive = job.status === 'running' || pendingLive;

  res.json({
    active: isActive,
    streamId: conversationId,
    status: job.status,
    aggregatedContent: resumeState?.aggregatedContent ?? [],
    createdAt: job.createdAt,
    resumeState,
    // Surface the live pending approval so a client rebuilding from /chat/status
    // (reload / cross-replica) has the action id + payload to render and submit
    // the prompt, not just the knowledge that the stream is paused. Client-safe
    // projection only — resumeContext/requestFingerprint stay server-side.
    pendingAction:
      job.status === 'requires_action' && pendingLive
        ? toClientPendingAction(pendingAction)
        : undefined,
  });
});

/**
 * @route POST /chat/abort
 * @desc Abort an ongoing generation job
 * @access Private
 * @description Mounted before chatRouter to bypass buildEndpointOption middleware
 */
router.post('/chat/abort', configMiddleware, async (req, res) => {
  logger.debug(`[AgentStream] ========== ABORT ENDPOINT HIT ==========`);
  logger.debug(`[AgentStream] Method: ${req.method}, Path: ${req.path}`);
  logger.debug(`[AgentStream] Body:`, req.body);

  const { streamId, conversationId, abortKey } = req.body;
  const userId = req.user?.id;

  // streamId === conversationId, so try any of the provided IDs
  // Skip "new" as it's a placeholder for new conversations, not an actual ID
  let jobStreamId =
    streamId ||
    (conversationId !== 'new' ? conversationId : null) ||
    abortKey?.split(':')[0] ||
    null;
  let job = jobStreamId ? await GenerationJobManager.getJob(jobStreamId) : null;

  // Fallback: if job not found and we have a userId, look up active jobs for user
  // This handles the case where frontend sends "new" but job was created with a UUID
  if (!job && userId) {
    logger.debug(`[AgentStream] Job not found by ID, checking active jobs for user: ${userId}`);
    const activeJobIds = await GenerationJobManager.getActiveJobIdsForUser(
      userId,
      req.user.tenantId,
    );
    for (const activeJobId of activeJobIds) {
      const activeJob = await GenerationJobManager.getJob(activeJobId);
      if (activeJob?.status !== 'running') {
        continue;
      }
      jobStreamId = activeJobId;
      job = activeJob;
      logger.debug(`[AgentStream] Found active job for user: ${jobStreamId}`);
      break;
    }
  }

  logger.debug(`[AgentStream] Computed jobStreamId: ${jobStreamId}`);

  if (job && jobStreamId) {
    if (job.metadata?.userId && job.metadata.userId !== userId) {
      logger.warn(`[AgentStream] Unauthorized abort attempt for ${jobStreamId} by user ${userId}`);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (hasTenantMismatch(job, req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    logger.debug(`[AgentStream] Job found, aborting: ${jobStreamId}`);
    // Re-attach a paused ask_user_question's args to the abort content BEFORE
    // abortJob emits the final SSE. Redis reconstructs abort content from the
    // chunk log, which never saw the pause-time stamp applied to the in-process
    // contentParts — stamping inside abortJob (not after) means the LIVE client
    // gets the question too, not just the saved message on reload.
    const abortedAskPayload = job.metadata?.pendingAction?.payload;
    const abortResult = await GenerationJobManager.abortJob(jobStreamId, {
      transformAbortContent: (content) =>
        abortedAskPayload?.type === 'ask_user_question' && Array.isArray(content)
          ? attachAskUserQuestionArgs(content, abortedAskPayload.question)
          : content,
    });
    logger.debug(`[AgentStream] Job aborted successfully: ${jobStreamId}`, {
      abortResultSuccess: abortResult.success,
      abortResultUserMessageId: abortResult.jobData?.userMessage?.messageId,
      abortResultResponseMessageId: abortResult.jobData?.responseMessageId,
    });

    // HITL: prune the durable checkpoint of a run aborted while paused, so a new turn
    // in this conversation can't rehydrate the stale interrupt before the Mongo TTL
    // reclaims it (thread_id is the stable conversationId). Idempotent / no-op when
    // HITL is off or nothing was written. The pendingAction check covers ask-only
    // pauses (ask_user_question attaches a checkpointer WITHOUT the approval policy):
    // a job aborted while paused still carries its pendingAction in metadata, which is
    // exactly the case whose checkpoint would otherwise go stale.
    const agentsCfg = req.config?.endpoints?.agents;
    if (isHITLEnabled(agentsCfg?.toolApproval) || job.metadata?.pendingAction != null) {
      await deleteAgentCheckpoint(jobStreamId, agentsCfg?.checkpointer).catch((err) =>
        logger.error(`[AgentStream] Failed to prune checkpoint on abort: ${jobStreamId}`, err),
      );
    }

    // CRITICAL: Save partial response BEFORE returning to prevent race condition.
    // If user sends a follow-up immediately after abort, the parentMessageId must exist in DB.
    // Only save if we have a valid responseMessageId (skip early aborts before generation started)
    if (
      abortResult.success &&
      abortResult.jobData?.userMessage?.messageId &&
      abortResult.jobData?.responseMessageId &&
      hasPersistableAbortContent(abortResult.content)
    ) {
      const { jobData, text } = abortResult;
      // `abortResult.content` is already stamped by `transformAbortContent`
      // above (same content the final SSE carried), so the saved message and
      // the live client agree.
      const { content } = abortResult;
      const responseMessage = {
        messageId: jobData.responseMessageId,
        parentMessageId: jobData.userMessage.messageId,
        conversationId: jobData.conversationId,
        content: content || [],
        text: text || '',
        sender: jobData.sender || 'AI',
        endpoint: jobData.endpoint,
        iconURL: jobData.iconURL,
        model: jobData.model,
        unfinished: true,
        error: false,
        isCreatedByUser: false,
        user: userId,
      };

      /** Persist the usage/cost rollup + context breakdown for the stopped
       *  response (from the job's tracked tokenUsage/contextUsage) so its
       *  branch/total cost and granular rows survive a reload — parity with the
       *  normal completion path. */
      const abortMetadata = buildAbortedResponseMetadata(jobData);
      if (abortMetadata) {
        responseMessage.metadata = abortMetadata;
      }

      try {
        await saveMessage(
          {
            userId: req?.user?.id,
            // Source from the job, not the request: the stop button posts only the
            // conversationId, so trusting req.body.isTemporary would persist an aborted
            // temporary-chat partial as a normal (orphaned) message.
            isTemporary: jobData?.isTemporary ?? req?.body?.isTemporary,
            interfaceConfig: req?.config?.interfaceConfig,
          },
          responseMessage,
          { context: 'api/server/routes/agents/index.js - abort endpoint' },
        );
        logger.debug(`[AgentStream] Saved partial response for: ${jobStreamId}`);
      } catch (saveError) {
        logger.error(`[AgentStream] Failed to save partial response: ${saveError.message}`);
      }
    }

    return res.json({ success: true, aborted: jobStreamId });
  }

  logger.warn(`[AgentStream] Job not found for streamId: ${jobStreamId}`);
  return res.status(404).json({ error: 'Job not found', streamId: jobStreamId });
});

router.use('/', v1);

const chatRouter = express.Router();
chatRouter.use(configMiddleware);

if (isEnabled(LIMIT_MESSAGE_IP)) {
  chatRouter.use(messageIpLimiter);
}

if (isEnabled(LIMIT_MESSAGE_USER)) {
  chatRouter.use(messageUserLimiter);
}

chatRouter.use('/', chat);
router.use('/chat', chatRouter);

module.exports = router;
