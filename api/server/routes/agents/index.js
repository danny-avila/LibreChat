const express = require('express');
const {
  isEnabled,
  GenerationJobManager,
  TERMINAL_PUBLICATION_RECONNECT_ERROR,
  hasPersistableAbortContent,
  buildAbortedResponseMetadata,
  isPendingActionStale,
  toClientPendingAction,
  isHITLEnabled,
  captureAgentCheckpointGeneration,
  deleteAgentCheckpoint,
  attachAskUserQuestionAnswers,
  attachAskUserQuestionArgs,
  createMessageFilterPii,
  isAgentTriggerRequest,
  exemptAgentTriggerFromIpLimiter,
} = require('@librechat/api');
const { createSseStreamTelemetry } = require('@librechat/api/telemetry');
const { logger } = require('@librechat/data-schemas');
const {
  uaParser,
  checkBan,
  moderateText,
  requireJwtAuth,
  messageIpLimiter,
  configMiddleware,
  messageUserLimiter,
} = require('~/server/middleware');
const SteerController = require('~/server/controllers/agents/steer');
const {
  GENERATION_PROTOCOL_HEADER,
  GENERATION_PROTOCOL_V2,
  getRequestedGenerationProtocol,
  getServerGenerationProtocol,
  negotiateExistingGenerationProtocol,
} = require('~/server/controllers/agents/protocol');
const {
  recordScheduleOutcome,
  clearScheduledJob,
  requestScheduledRunAbort,
  markScheduledRunAbortPersisted,
} = require('~/server/services/Schedules');
const { saveMessage } = require('~/models');
const responses = require('./responses');
const openai = require('./openai');
const { v1 } = require('./v1');
const chat = require('./chat');

const { LIMIT_MESSAGE_IP, LIMIT_MESSAGE_USER } = process.env ?? {};

/** Applies `limiter` unless this trusted loopback request should skip it. */
const unless = (isExempt, limiter) => (req, res, next) =>
  isExempt(req) ? next() : limiter(req, res, next);

/** Untenanted jobs (pre-multi-tenancy) remain accessible if the userId check passes. */
function hasTenantMismatch(job, user) {
  return job.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

/** Protocol selected before a job has been authorized/read. This is used for
 * validation, not-found, and authorization envelopes; it never leaks an
 * existing job's marker to an unauthorized caller. */
function negotiateRequestGenerationProtocol(req) {
  return Math.min(
    getRequestedGenerationProtocol(req),
    getServerGenerationProtocol(GenerationJobManager),
  );
}

/** Every generation-control JSON envelope carries the exact numeric protocol
 * that governs it. The response header is useful to fetch/Axios callers, while
 * the body survives auth-refresh adapters and is the client's fail-closed
 * source of truth. */
function sendGenerationJson(res, status, body, generationProtocolVersion) {
  res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
  return res.status(status).json({ ...body, generationProtocolVersion });
}

async function sendJoblessStatus(req, res, conversationId) {
  // The default completeJob path deletes the job record immediately, so the
  // jobless branch IS the common reload-after-terminal case — parked steers
  // live under their own bounded-TTL key and authorize from their stored owner.
  const requestedProtocolVersion = getRequestedGenerationProtocol(req);
  const claimed = await GenerationJobManager.steering.claimDetailed(
    conversationId,
    {
      userId: req.user.id,
      tenantId: req.user.tenantId,
    },
    requestedProtocolVersion,
  );
  const generationProtocolVersion = Math.min(
    requestedProtocolVersion,
    claimed.steers.length > 0
      ? claimed.generationProtocolVersion
      : getServerGenerationProtocol(GenerationJobManager),
  );
  res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
  return res.json({
    active: false,
    generationProtocolVersion,
    ...(claimed.steers.length > 0 && { unrecoveredSteers: claimed.steers }),
  });
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
// Capture the short-lived trigger identity immediately after authentication. Downstream
// middleware reads this stable decision instead of re-verifying an expired token.
router.use((req, _res, next) => {
  req._isAgentTrigger = isAgentTriggerRequest(req);
  next();
});
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
  const requestProtocolVersion = negotiateRequestGenerationProtocol(req);
  const rawGenerationCreatedAt = req.query.generationCreatedAt;
  let expectedGenerationCreatedAt;
  if (rawGenerationCreatedAt != null) {
    if (
      typeof rawGenerationCreatedAt !== 'string' ||
      !/^\d+$/.test(rawGenerationCreatedAt) ||
      !Number.isSafeInteger(Number(rawGenerationCreatedAt))
    ) {
      return sendGenerationJson(
        res,
        400,
        { error: 'Invalid generation identity' },
        requestProtocolVersion,
      );
    }
    expectedGenerationCreatedAt = Number(rawGenerationCreatedAt);
  }
  let result;
  const attachmentAbortController = new AbortController();
  req.on('close', () => {
    logger.debug(`[AgentStream] Client disconnected from ${streamId}`);
    attachmentAbortController.abort();
    result?.unsubscribe();
  });

  const job = await GenerationJobManager.getJob(streamId);
  if (attachmentAbortController.signal.aborted) {
    return;
  }
  if (!job) {
    return sendGenerationJson(
      res,
      404,
      {
        error: 'Stream not found',
        message: 'The generation job does not exist or has expired.',
      },
      requestProtocolVersion,
    );
  }

  // Every job has an owner at creation time. Treat a missing/corrupt owner as
  // unauthorized instead of turning malformed store state into a public
  // stream for anyone who knows the conversation id.
  if (job.metadata?.userId !== req.user.id) {
    return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
  }

  if (hasTenantMismatch(job, req.user)) {
    return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
  }

  const generationProtocolVersion = negotiateExistingGenerationProtocol(req, job);

  if (expectedGenerationCreatedAt != null && job.createdAt !== expectedGenerationCreatedAt) {
    // streamId is conversation-scoped and may now belong to a newer turn. A
    // stale start/reconnect gets a dedicated handoff signal instead of either
    // following the ordinary terminal path or receiving replacement content.
    return sendGenerationJson(
      res,
      409,
      {
        code: 'GENERATION_REPLACED',
        error: 'Generation replaced',
        message: 'The requested generation has completed or was replaced.',
      },
      generationProtocolVersion,
    );
  }

  /** Pin even legacy (unfenced-query) subscribers to the exact job snapshot
   * that passed the owner + tenant checks above. `streamId` is conversation-
   * scoped, so a replacement can otherwise land between this authorization
   * read and the manager attachment and expose the replacement generation
   * without ever authorizing its owner. */
  const authorizedGenerationCreatedAt = job.createdAt;
  if (!Number.isSafeInteger(authorizedGenerationCreatedAt) || authorizedGenerationCreatedAt < 0) {
    logger.warn(`[AgentStream] Refusing stream with invalid generation identity: ${streamId}`);
    return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
  }
  const streamTelemetry = createSseStreamTelemetry({ req, res, streamId, isResume });

  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
  res.flushHeaders();
  streamTelemetry.recordHeadersFlushed();

  logger.debug(`[AgentStream] Client subscribed to ${streamId}, resume: ${isResume}`);

  const writeEvent = (event, options = {}) => {
    if (generationProtocolVersion < GENERATION_PROTOCOL_V2 && event?.event === 'on_steer_updated') {
      return true;
    }
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
    if (event?.reconcile === true && generationProtocolVersion < GENERATION_PROTOCOL_V2) {
      /** Legacy clients treat an ordinary `final: true` as the completion of
       * their optimistic submission. A reconciliation frame has no response
       * payload and may describe a replacement, so expose it only as a
       * transport error; the v1 reconnect/status path will refetch safely. */
      writeEvent(
        {
          error: 'Generation state changed; reconnect to load the saved response.',
          generationProtocolVersion,
        },
        { eventName: 'error', final: true },
      );
      res.end();
      return;
    }
    writeEvent(
      event != null && typeof event === 'object'
        ? { ...event, generationProtocolVersion }
        : { final: true, generationProtocolVersion },
      { final: true },
    );
    res.end();
  };

  const onError = (error) => {
    if (!res.writableEnded) {
      streamTelemetry.recordErrorEventEmitted();
      if (error === TERMINAL_PUBLICATION_RECONNECT_ERROR) {
        /** A durable terminal payload exists, but cross-replica DONE publish
         * failed. Tear down the HTTP stream without an application error frame:
         * sse.js treats the transport close as reconnectable, and the retained
         * terminal job then replays its authoritative final payload. */
        res.destroy();
        return;
      }
      writeEvent({ error, generationProtocolVersion }, { eventName: 'error' });
      res.end();
    }
  };

  if (isResume) {
    const { subscription, resumeState, pendingEvents } =
      await GenerationJobManager.subscribeWithResume(streamId, writeEvent, onDone, onError, {
        signal: attachmentAbortController.signal,
        expectedCreatedAt: authorizedGenerationCreatedAt,
      });

    if (subscription && !attachmentAbortController.signal.aborted && !res.writableEnded) {
      if (resumeState) {
        writeEvent({ sync: true, resumeState, pendingEvents });
        GenerationJobManager.markSyncSent(streamId, authorizedGenerationCreatedAt);
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
      subscription.activate();
    } else {
      subscription?.unsubscribe();
    }

    result = subscription;
  } else {
    result = await GenerationJobManager.subscribe(streamId, writeEvent, onDone, onError, {
      signal: attachmentAbortController.signal,
      expectedCreatedAt: authorizedGenerationCreatedAt,
    });
  }

  if (attachmentAbortController.signal.aborted) {
    result?.unsubscribe();
    return;
  }
  if (!result) {
    streamTelemetry.recordSubscribeFailed();
    {
      let currentJob;
      let currentJobReadSucceeded = false;
      try {
        currentJob = await GenerationJobManager.getJob(streamId);
        currentJobReadSucceeded = true;
      } catch (error) {
        logger.warn(`[AgentStream] Failed to reconcile fenced subscription for ${streamId}`, error);
      }

      if (attachmentAbortController.signal.aborted || res.writableEnded) {
        return;
      }

      const currentJobAuthorized =
        currentJobReadSucceeded &&
        (!currentJob ||
          (currentJob.metadata?.userId === req.user.id &&
            !hasTenantMismatch(currentJob, req.user)));
      const generationReplaced =
        currentJobAuthorized &&
        currentJob != null &&
        currentJob.createdAt !== authorizedGenerationCreatedAt;
      const expectedGenerationTerminal =
        currentJobAuthorized &&
        currentJob?.createdAt === authorizedGenerationCreatedAt &&
        ['complete', 'error', 'aborted'].includes(currentJob.status);

      /** The route already flushed SSE headers before the manager's final
       * generation fence ran. A generic error here would misreport the common
       * snapshot-to-attach race where the requested run terminalized or was
       * replaced. Send the same control-only reconciliation frame used by the
       * manager so the client refetches authoritative state instead. */
      if (
        currentJobReadSucceeded &&
        (generationReplaced || !currentJob || expectedGenerationTerminal)
      ) {
        onDone({
          final: true,
          reconcile: true,
          reconcileReason: generationReplaced ? 'generation_replaced' : 'terminal_payload_missing',
          ...(expectedGenerationTerminal && { terminalStatus: currentJob.status }),
          generationCreatedAt: authorizedGenerationCreatedAt,
          conversation: {
            conversationId: currentJob?.conversationId ?? job.conversationId ?? streamId,
          },
        });
        return;
      }
    }
    onError('Failed to subscribe to stream');
    return;
  }
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
  const requestProtocolVersion = negotiateRequestGenerationProtocol(req);

  // streamId === conversationId, so we can use getJob directly
  let job = await GenerationJobManager.getJob(conversationId);

  if (!job) {
    return sendJoblessStatus(req, res, conversationId);
  }

  let resumeState;
  let snapshotVerified = false;
  /** `getResumeState` begins with its own streamId lookup. A replacement can
   * land after this route authorizes A but before that lookup and make it read
   * B's content. Verify the epoch after each read and discard mismatched
   * snapshots; every replacement snapshot is re-authorized before use. */
  for (let attempt = 0; attempt < 3; attempt++) {
    if (job.metadata?.userId !== req.user.id || hasTenantMismatch(job, req.user)) {
      return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
    }
    if (!Number.isSafeInteger(job.createdAt) || job.createdAt < 0) {
      return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
    }

    const authorizedCreatedAt = job.createdAt;
    resumeState = await GenerationJobManager.getResumeState(conversationId, authorizedCreatedAt);
    const verifiedJob = await GenerationJobManager.getJob(conversationId);
    if (!verifiedJob) {
      return sendJoblessStatus(req, res, conversationId);
    }
    if (verifiedJob.createdAt === authorizedCreatedAt) {
      if (
        verifiedJob.metadata?.userId !== req.user.id ||
        hasTenantMismatch(verifiedJob, req.user)
      ) {
        return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
      }
      job = verifiedJob;
      snapshotVerified = true;
      break;
    }
    job = verifiedJob;
  }

  if (!snapshotVerified) {
    res.set('Retry-After', '1');
    return sendGenerationJson(res, 503, { code: 'SERVER_NOT_READY' }, requestProtocolVersion);
  }

  /** Abort has won terminal ownership, but its required message/checkpoint
   * persistence has not finished yet. Reporting this snapshot as inactive
   * would let a reloading client clear its live state and refetch history
   * before the terminal owner has made that history authoritative. `getJob`
   * recovers a stale pending marker; while the verified marker remains live,
   * keep every status consumer on the same readiness path as duplicate starts. */
  if (job.metadata?.terminalPersistencePending === true) {
    res.set('Retry-After', '1');
    return sendGenerationJson(
      res,
      503,
      { code: 'SERVER_NOT_READY' },
      negotiateExistingGenerationProtocol(req, job),
    );
  }
  let generationProtocolVersion = negotiateExistingGenerationProtocol(req, job);
  res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));

  // A job paused for human review is still active (consistent with /chat/active),
  // so the client resumes/subscribes rather than treating it as finished — but
  // only while it has a live, resolvable prompt: a missing/malformed or
  // past-expiry pendingAction reads as inactive (cleanup/expiry will finalize it).
  const pendingAction = job.metadata.pendingAction;
  const pendingLive = job.status === 'requires_action' && !isPendingActionStale({ pendingAction });
  const isActive = job.status === 'running' || pendingLive;

  /** Acknowledged steers the terminal drains parked because no subscriber was
   *  live to receive the final/abort event. Reads are replayable; a recovery
   *  turn leases its exact source and removes it only after durable persistence. */
  let unrecoveredSteers;
  if (!isActive || job.metadata.steersClosed === true) {
    const claimed = await GenerationJobManager.steering.claimDetailed(
      conversationId,
      {
        userId: req.user.id,
        tenantId: req.user.tenantId,
      },
      getRequestedGenerationProtocol(req),
    );
    if (claimed.steers.length > 0) {
      generationProtocolVersion = Math.min(
        generationProtocolVersion,
        claimed.generationProtocolVersion,
      );
      res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
      unrecoveredSteers = claimed.steers;
    }
  }

  res.json({
    active: isActive,
    generationProtocolVersion,
    ...(unrecoveredSteers && { unrecoveredSteers }),
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
router.post('/chat/abort', configMiddleware, async (req, res, next) => {
  logger.debug(`[AgentStream] ========== ABORT ENDPOINT HIT ==========`);
  logger.debug(`[AgentStream] Method: ${req.method}, Path: ${req.path}`);
  logger.debug(`[AgentStream] Body:`, req.body);

  const requestProtocolVersion = negotiateRequestGenerationProtocol(req);
  let responseProtocolVersion = requestProtocolVersion;
  try {
    if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendGenerationJson(res, 400, { code: 'INVALID_ABORT_TARGET' }, requestProtocolVersion);
    }
    const { streamId, conversationId, abortKey, generationCreatedAt } = req.body;
    for (const value of [streamId, conversationId, abortKey]) {
      if (
        value != null &&
        (typeof value !== 'string' || value.length === 0 || value.length > 512)
      ) {
        return sendGenerationJson(
          res,
          400,
          { code: 'INVALID_ABORT_TARGET' },
          requestProtocolVersion,
        );
      }
    }
    const userId = req.user?.id;
    if (
      generationCreatedAt != null &&
      (!Number.isSafeInteger(generationCreatedAt) || generationCreatedAt < 0)
    ) {
      return sendGenerationJson(
        res,
        400,
        { code: 'INVALID_GENERATION_IDENTITY' },
        requestProtocolVersion,
      );
    }

    // streamId === conversationId, so try any of the provided IDs
    // Skip "new" as it's a placeholder for new conversations, not an actual ID.
    const streamCandidate = streamId && streamId !== 'new' ? streamId : null;
    const conversationCandidate =
      conversationId && conversationId !== 'new' ? conversationId : null;
    const abortCandidate = abortKey?.split(':')[0];
    const abortKeyCandidate = abortCandidate && abortCandidate !== 'new' ? abortCandidate : null;
    let jobStreamId = streamCandidate || conversationCandidate || abortKeyCandidate || null;
    let job = jobStreamId ? await GenerationJobManager.getJob(jobStreamId) : null;

    /** Fallback only for the explicit new-conversation placeholder. An unknown
     * concrete id (including a typo/stale tab) must never abort an unrelated
     * active job. If several new-chat starts are active, the epoch selects the
     * exact one; an unfenced legacy request is safe only when unambiguous. */
    const canResolveNewPlaceholder =
      !jobStreamId && (streamId === 'new' || conversationId === 'new') && userId;
    if (!job && canResolveNewPlaceholder) {
      logger.debug(`[AgentStream] Job not found by ID, checking active jobs for user: ${userId}`);
      const activeJobIds = await GenerationJobManager.getActiveJobIdsForUser(
        userId,
        req.user.tenantId,
      );
      const candidates = [];
      for (const activeJobId of activeJobIds) {
        const activeJob = await GenerationJobManager.getJob(activeJobId);
        if (
          !activeJob ||
          (activeJob.status !== 'running' && activeJob.status !== 'requires_action') ||
          activeJob.metadata?.userId !== userId ||
          hasTenantMismatch(activeJob, req.user) ||
          (generationCreatedAt != null && activeJob.createdAt !== generationCreatedAt)
        ) {
          continue;
        }
        // A background scheduled fire shares this per-user store but is never what the
        // stop button meant. With no conversation id to match on, picking one would abort
        // the schedule and leave the interactive turn the user actually stopped running.
        if (activeJob.metadata?.scheduleId) {
          continue;
        }
        candidates.push({ streamId: activeJobId, job: activeJob });
      }
      if (candidates.length > 1) {
        return sendGenerationJson(
          res,
          409,
          { code: 'AMBIGUOUS_ACTIVE_RUN' },
          requestProtocolVersion,
        );
      }
      if (candidates.length === 1) {
        jobStreamId = candidates[0].streamId;
        job = candidates[0].job;
        logger.debug(`[AgentStream] Found active job for user: ${jobStreamId}`);
      }
    }

    logger.debug(`[AgentStream] Computed jobStreamId: ${jobStreamId}`);

    if (job && jobStreamId) {
      if (job.metadata?.userId !== userId) {
        logger.warn(
          `[AgentStream] Unauthorized abort attempt for ${jobStreamId} by user ${userId}`,
        );
        return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
      }

      if (hasTenantMismatch(job, req.user)) {
        return sendGenerationJson(res, 403, { error: 'Unauthorized' }, requestProtocolVersion);
      }
      const generationProtocolVersion = negotiateExistingGenerationProtocol(req, job);
      responseProtocolVersion = generationProtocolVersion;
      res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
      if (generationCreatedAt != null && job.createdAt !== generationCreatedAt) {
        return res.status(409).json({ code: 'RUN_REPLACED', generationProtocolVersion });
      }

      logger.debug(`[AgentStream] Job found, aborting: ${jobStreamId}`);
      // Re-attach a paused ask_user_question's args to the abort content BEFORE
      // abortJob emits the final SSE. Redis reconstructs abort content from the
      // chunk log, which never saw the pause-time stamp applied to the in-process
      // contentParts — stamping inside abortJob (not after) means the LIVE client
      // gets the question too, not just the saved message on reload.
      const initialResolvedAskUserQuestions = job.metadata?.resolvedAskUserQuestions;
      const agentsCfg = req.config?.endpoints?.agents;
      /** The pendingAction check covers ask-only pauses: `ask_user_question` attaches a
       * checkpointer WITHOUT the approval policy, and a job aborted while paused still
       * carries its pendingAction — exactly the checkpoint that would otherwise go
       * stale until the Mongo TTL reclaims it. */
      const shouldPruneCheckpoint =
        isHITLEnabled(agentsCfg?.toolApproval) ||
        job.metadata?.pendingAction != null ||
        initialResolvedAskUserQuestions?.length > 0;
      const checkpointNamespace =
        typeof job.metadata?.checkpointNamespace === 'string'
          ? job.metadata.checkpointNamespace
          : '';
      /** New jobs have an immutable saver-level namespace, so the terminal
       * owner can delete that entire namespace (including a checkpoint written
       * after this route's initial read) without touching a replacement. Legacy
       * jobs share the root namespace and still need an id snapshot before CAS. */
      const checkpointGeneration =
        shouldPruneCheckpoint && checkpointNamespace === ''
          ? await captureAgentCheckpointGeneration(jobStreamId, agentsCfg?.checkpointer, {
              throwOnError: true,
            })
          : undefined;

      const scheduleId = job.metadata?.scheduleId;
      const jobIsLive = job.status === 'running' || job.status === 'requires_action';
      // Stamp the run abort-REQUESTED (source 'stop') before signalling. abortJob flips
      // the job to `aborted` (or removes it) the moment it wins its status CAS, while
      // its `beforePublish` barrier below still has to save the partial. Without the
      // stamp, an account-deletion quiesce reading that post-abort state takes it as
      // proof the generation is done, confirms its drain, and destroys the user's data
      // seconds before saveMessage writes a message back for the deleted account. The
      // stamp is therefore LOAD-BEARING: if it cannot be made durable the abort must not
      // proceed (nothing has been signalled yet, so refusing here is side-effect free).
      //
      // Only against a job observed LIVE: the stamp RENEWS the owner-death fence, and
      // renewing it for a cleanup abort of an already-terminal job would re-fence a dead
      // owner's run on every Stop click, keeping it from ever aging into the
      // reconciler's recovery. `stamped` is remembered so every exit below resolves the
      // attempt (abortPersistedAt) once this route has nothing further to persist —
      // otherwise the generation owner's settlement barrier waits its full timeout on
      // an attempt that lost.
      const scheduledFireIdentity =
        scheduleId && job.metadata?.scheduledFor
          ? { scheduleId, scheduledFor: new Date(job.metadata.scheduledFor) }
          : null;
      let scheduledStopStamped = false;
      if (scheduledFireIdentity && jobIsLive) {
        const stampResult = await requestScheduledRunAbort(
          scheduledFireIdentity.scheduleId,
          scheduledFireIdentity.scheduledFor,
        );
        if (stampResult === 'failed') {
          return sendGenerationJson(
            res,
            503,
            { error: 'Could not record the stop request. Please retry.', aborted: null },
            generationProtocolVersion,
          );
        }
        // Another Stop attempt is mid-flight for this run (the per-run stamp is the
        // serialization arbiter). Acting here would race the winner: aborting could
        // lose its CAS and resolving would release the settlement barrier while the
        // winner is still pruning and saving. The user's intent is already being
        // executed, so answer as the duplicate it is.
        if (stampResult === 'in_progress') {
          logger.debug(`[AgentStream] Stop already in progress for ${jobStreamId}`);
          return sendGenerationJson(
            res,
            200,
            { success: true, aborted: jobStreamId },
            generationProtocolVersion,
          );
        }
        scheduledStopStamped = stampResult === 'stamped';
      }
      // Bounded retries, not a single swallowed attempt: an unresolved stamp makes
      // every subsequent Stop answer 'in_progress' — a false success that retries
      // nothing — while fencing the owner's settlement barrier and the reconciler
      // for the full stale window. One transient Mongo failure must not buy all that.
      const stampAbortPersistedWithRetries = async () => {
        if (!scheduledFireIdentity) {
          return true;
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await markScheduledRunAbortPersisted(
              scheduledFireIdentity.scheduleId,
              scheduledFireIdentity.scheduledFor,
            );
            return true;
          } catch (err) {
            logger.error(
              `[AgentStream] Failed to stamp abort persistence (attempt ${attempt}/3): ${jobStreamId}`,
              err,
            );
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
            }
          }
        }
        return false;
      };
      const resolveStopAttempt = async () => {
        if (!scheduledStopStamped || !scheduledFireIdentity) {
          return;
        }
        await stampAbortPersistedWithRetries();
      };

      const abortResult = await GenerationJobManager.abortJob(jobStreamId, {
        // Fence on the generation THIS handler observed: a replacement turn can reuse the
        // conversationId between the lookup above and here, and must not receive the stop.
        expectedCreatedAt: job.createdAt,
        // Retain the terminal job until its outcome is durably recorded below — it is the
        // reconciler's only evidence if that write fails.
        preserveForReconcile: Boolean(scheduleId),
        transformAbortContent: (content, abortJobData) => {
          if (!Array.isArray(content)) {
            return content;
          }
          const abortedAskPayload = abortJobData.pendingAction?.payload;
          const resolvedAskUserQuestions = abortJobData.resolvedAskUserQuestions ?? [];
          const answeredContent = attachAskUserQuestionAnswers(content, resolvedAskUserQuestions);
          return abortedAskPayload?.type === 'ask_user_question'
            ? attachAskUserQuestionArgs(
                answeredContent,
                Array.isArray(abortedAskPayload.questions)
                  ? { questions: abortedAskPayload.questions }
                  : abortedAskPayload.question,
                abortedAskPayload.tool_call_id,
              )
            : answeredContent;
        },
        /** Persist every parent-row prerequisite before publishing the ordinary
         * abort FINAL. That frame can immediately drain a queued follow-up, whose
         * parent must already exist and whose graph must not see a stale HITL
         * checkpoint. Throwing makes the manager publish a conservative
         * reconciliation frame instead of an unsafe normal FINAL. */
        beforePublish: async (pendingAbortResult) => {
          const persistenceErrors = [];
          const { jobData, text, content } = pendingAbortResult;
          /** `abortJob` treats a delivered `created` event as a real turn even
           * when every streamed part is filtered out (for example, an
           * interrupt before the model's first non-whitespace token). Its
           * normal FINAL therefore carries an empty unfinished assistant.
           * Persist that same row before publishing, including when its id is
           * the underscore-suffixed preliminary id rendered by `created`.
           * Otherwise interrupt-and-send immediately posts that unsaved id as
           * its parent and the preliminary-parent fence correctly rejects it. */
          const shouldPersistAbortedTurn =
            hasPersistableAbortContent(content) || jobData?.createdEventEmitted === true;

          if (
            jobData?.userMessage?.messageId &&
            jobData?.responseMessageId &&
            shouldPersistAbortedTurn
          ) {
            const messageContext = {
              userId: req?.user?.id,
              // Source from the job: the stop request does not carry the
              // original temporary-chat flag.
              isTemporary: jobData?.isTemporary ?? req?.body?.isTemporary,
              interfaceConfig: req?.config?.interfaceConfig,
            };
            const requestMessage = {
              ...jobData.userMessage,
              conversationId: jobData.conversationId,
              sender: 'User',
              endpoint: jobData.endpoint,
              isCreatedByUser: true,
              user: userId,
            };
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

            /** `created` fires before BaseClient starts its asynchronous user
             * write. A very early interrupt can therefore reach this barrier
             * with neither row stored. Both writes are idempotent upserts;
             * await the user prerequisite first, but still attempt the child
             * write and checkpoint cleanup so every independently useful
             * operation gets a chance to succeed. */
            try {
              const persistedRequest = await saveMessage(messageContext, requestMessage, {
                context: 'api/server/routes/agents/index.js - abort user prerequisite',
              });
              if (!persistedRequest) {
                throw new Error('Abort user prerequisite was not persisted');
              }
            } catch (error) {
              persistenceErrors.push(error);
            }

            try {
              const persistedResponse = await saveMessage(messageContext, responseMessage, {
                context: 'api/server/routes/agents/index.js - abort endpoint',
              });
              if (!persistedResponse) {
                throw new Error('Abort response was not persisted');
              }
              logger.debug(`[AgentStream] Saved partial response for: ${jobStreamId}`);
            } catch (error) {
              persistenceErrors.push(error);
            }
          }

          /** Attempt checkpoint cleanup even when the message write failed, and
           * attempt the message write even when cleanup will fail. Both are
           * independently valuable; any failure still suppresses the normal
           * FINAL after all required work has been attempted. */
          if (shouldPruneCheckpoint) {
            try {
              await deleteAgentCheckpoint(
                jobStreamId,
                agentsCfg?.checkpointer,
                checkpointGeneration,
                checkpointNamespace !== ''
                  ? { throwOnError: true, checkpointNamespace }
                  : { throwOnError: true },
              );
            } catch (error) {
              persistenceErrors.push(error);
            }
          }

          if (persistenceErrors.length === 1) {
            throw persistenceErrors[0];
          }
          if (persistenceErrors.length > 1) {
            const error = new Error('Abort message persistence and checkpoint cleanup failed');
            error.causes = persistenceErrors;
            throw error;
          }
        },
      });
      if (abortResult.failureReason === 'generation_replaced') {
        await resolveStopAttempt();
        return res.status(409).json({ code: 'RUN_REPLACED', generationProtocolVersion });
      }
      if (abortResult.failureReason === 'job_still_active') {
        await resolveStopAttempt();
        res.set('Retry-After', '1');
        return res.status(409).json({ code: 'RUN_STILL_ACTIVE', generationProtocolVersion });
      }
      // Every side effect of a stop (the `beforePublish` checkpoint prune and partial
      // save, the settlement below) belongs exclusively to a WON abort. A lost CAS means
      // a concurrent transition owns the job now — a completion, or a pause→running
      // resume whose live turn a prune would strip the resume state from — so nothing
      // here may act on it, and `beforePublish` never ran.
      if (!abortResult.success) {
        // A job already `aborted` is a PREVIOUS Stop's win — but terminal status is
        // not proof its publication ever left that replica. Re-publish rather than
        // trust it (the interactive mirror of the scheduled path's resignalAbort),
        // so the retry after a failed-publish 503 actually redelivers.
        if (abortResult.jobData?.status === 'aborted') {
          const resignal = await GenerationJobManager.resignalAbort(
            jobStreamId,
            job.createdAt,
          ).catch(() => ({ delivered: false, published: false }));
          // A swallowed republication failure must not read as success: with the
          // signal provably still on this replica, the peer-owned generation keeps
          // running, so the response stays retryable until a publish leaves (or
          // this process turns out to own the generation). Scheduled runs included —
          // the stamp fences settlement, not delivery.
          if (!resignal.delivered && !resignal.published) {
            res.set('Retry-After', '2');
            return sendGenerationJson(
              res,
              503,
              {
                error: 'Stop recorded but not yet delivered to the generation. Please retry.',
                aborted: null,
              },
              generationProtocolVersion,
            );
          }
          // Delivered or republished. For a SCHEDULED run this retry never held the
          // live-job stamp (the job was already terminal), so resolveStopAttempt
          // no-ops — mark the abort persisted DIRECTLY: this route has no stop-side
          // persistence pending on this path, and without the mark the generation
          // owner's settlement barrier waits its full timeout on the ORIGINAL
          // attempt's stamp before deferring to the reconciler. Same bounded retries
          // as the live-stamp path, and a swallowed exhaustion must not read as
          // success: with the fence unresolved the run keeps blocking overlap and
          // global capacity until the stale window, so the response stays retryable
          // until the stamp is durable.
          if (scheduledFireIdentity && !scheduledStopStamped) {
            const stamped = await stampAbortPersistedWithRetries();
            if (!stamped) {
              res.set('Retry-After', '2');
              return sendGenerationJson(
                res,
                503,
                {
                  error: 'Stop delivered but its bookkeeping is not yet durable. Please retry.',
                  aborted: null,
                },
                generationProtocolVersion,
              );
            }
          }
          await resolveStopAttempt();
          return sendGenerationJson(
            res,
            200,
            { success: true, aborted: jobStreamId },
            generationProtocolVersion,
          );
        }

        // jobData == null: either the job simply VANISHED between the lookup and the
        // abort (the benign race of pressing Stop as a generation completes), or a
        // REPLACEMENT claimed the conversationId. FAIL CLOSED on an unreadable store:
        // null from getJob means confirmed absent (benign), a thrown read means UNKNOWN
        // — a replacement may be live. Nothing of ours was stopped, so refusing here
        // has no side effects and the client simply retries.
        if (!abortResult.jobData) {
          let liveJob;
          try {
            liveJob = await GenerationJobManager.getJob(jobStreamId);
          } catch (err) {
            logger.error(`[AgentStream] Could not verify abort state: ${jobStreamId}`, err);
            // This attempt is over either way — nothing was stopped, so this route has no
            // persistence left to perform. Leaving the stamp unresolved would make every
            // retry answer 'in_progress' (a false success) and hold the owner's settlement
            // barrier + the reconciler fence for the full stale window.
            await resolveStopAttempt();
            return sendGenerationJson(
              res,
              503,
              {
                error: 'Could not verify the generation state. Please retry.',
                aborted: null,
              },
              generationProtocolVersion,
            );
          }
          await resolveStopAttempt();
          if (liveJob != null && liveJob.createdAt !== job.createdAt) {
            logger.debug(
              `[AgentStream] Abort refused: generation was replaced before it landed: ${jobStreamId}`,
            );
            return sendGenerationJson(
              res,
              409,
              { error: 'This generation was superseded', aborted: null },
              generationProtocolVersion,
            );
          }
          // The authorized generation is still live and no abort FINAL exists: never
          // claim that Stop won, tell the client to retry instead.
          if (liveJob?.status === 'running' || liveJob?.status === 'requires_action') {
            res.set('Retry-After', '1');
            return res.status(409).json({ code: 'RUN_STILL_ACTIVE', generationProtocolVersion });
          }
          // Confirmed benign vanish (or an already-terminal record): nothing to prune or
          // persist for it, and the generation's own final already reached the client.
          return sendGenerationJson(
            res,
            200,
            { success: true, aborted: jobStreamId },
            generationProtocolVersion,
          );
        }

        // Lost the terminal CAS between abortJob's own fresh read and its transition:
        // a completion or a resume claimed the job. Nothing was stopped; nothing may
        // be pruned or persisted. The stop attempt is over, so resolve it BEFORE the
        // reconciliation read — the generation owner's settlement barrier must not wait
        // on a loser even if that read throws.
        await resolveStopAttempt();
        logger.debug(`[AgentStream] Abort lost to a concurrent transition: ${jobStreamId}`);
        const currentJob = await GenerationJobManager.getJob(jobStreamId);
        if (currentJob && currentJob.createdAt !== job.createdAt) {
          return res.status(409).json({ code: 'RUN_REPLACED', generationProtocolVersion });
        }
        if (currentJob?.status === 'running' || currentJob?.status === 'requires_action') {
          res.set('Retry-After', '1');
          return res.status(409).json({ code: 'RUN_STILL_ACTIVE', generationProtocolVersion });
        }

        if (generationProtocolVersion < GENERATION_PROTOCOL_V2) {
          return res.json({
            success: true,
            aborted: jobStreamId,
            generationProtocolVersion,
          });
        }
        return res.json({
          success: false,
          settled: true,
          code: 'RUN_ALREADY_SETTLED',
          streamId: jobStreamId,
          generationProtocolVersion,
          ...(currentJob?.status && { terminalStatus: currentJob.status }),
        });
      }
      logger.debug(`[AgentStream] Job aborted successfully: ${jobStreamId}`, {
        abortResultSuccess: abortResult.success,
        abortResultUserMessageId: abortResult.jobData?.userMessage?.messageId,
        abortResultResponseMessageId: abortResult.jobData?.responseMessageId,
      });

      // The status the abort's terminal CAS actually won FROM. `jobData.status` is the
      // PRE-race read: a paused run that resumed on another replica before the CAS is
      // aborted from `running`, and both decisions below ("was there a generation loop
      // to deliver to?" and "is this route the run's only settler?") are wrong if they
      // trust the stale read. Falls back for a store that predates the field.
      const abortedFromStatus = abortResult.abortedFromStatus ?? abortResult.jobData?.status;

      // A won CAS whose cross-replica publication provably FAILED (threw/timed out)
      // means the stop never left this replica: the peer-owned generation keeps
      // running and billing. Re-signal once; if that also fails, the response stays
      // retryable — but the won abort's persistence work (checkpoint prune, partial
      // save) has already landed inside `beforePublish`, because a client that never
      // retries must not permanently lose the stopped response over a transient
      // publish failure. A paused (`requires_action`) job is exempt: it has no
      // generation loop left to deliver to, so a failed publish there costs nothing
      // and the stop proceeds as a plain success — including its paused-run settlement.
      let abortSignalUndelivered = false;
      if (
        abortResult.signalDelivered === false &&
        abortResult.signalPublished === false &&
        abortedFromStatus !== 'requires_action'
      ) {
        const resignal = await GenerationJobManager.resignalAbort(jobStreamId, job.createdAt).catch(
          () => ({ delivered: false, published: false }),
        );
        abortSignalUndelivered = !resignal.delivered && !resignal.published;
      }

      // If the signal provably never left this replica, the peer-owned generation may
      // still be running: the stamp stays UNRESOLVED on this exit (an undelivered
      // abort must keep fencing the drains) and the response stays retryable. The
      // retry finds the job terminal, republishes on the already-aborted branch above,
      // and only then resolves the stamp — with nothing left to persist, since
      // `beforePublish` already persisted everything.
      if (abortSignalUndelivered) {
        res.set('Retry-After', '2');
        return sendGenerationJson(
          res,
          503,
          {
            error: 'Stop recorded but not yet delivered to the generation. Please retry.',
            aborted: null,
          },
          generationProtocolVersion,
        );
      }

      // Stamp the persistence durably: the GENERATION OWNER's settlement barrier waits
      // for this stamp (see awaitStopAbortPersistence), so the run cannot leave the
      // active set — and no deletion drain can confirm — while `beforePublish` was
      // still persisting.
      await resolveStopAttempt();

      // SETTLE ONLY A PAUSED RUN. A run caught `requires_action` at the abort CAS has no
      // generation loop left to unwind — its pause already awaited every save — so this
      // route is its only settler, and settling after the writes above keeps the
      // settle-last discipline. A RUNNING abort instead settles in its generation
      // owner's catch, which awaits its own pending saves plus this route's stamp; a
      // route-side settle there could land while the owner's user-message save was still
      // in flight — the drain-mid-write hazard again. If that owner is dead, the
      // reconciler's aborted-branch finalizes the run once the abort fence lapses.
      //
      // Only after WINNING the abort: losing the CAS means a concurrent completion or
      // resume owns the run, and terminalizing it as `interrupted` would release its slot
      // and reduce the real outcome's write to a no-op against an already-terminal row.
      if (scheduleId && abortResult.success && abortedFromStatus === 'requires_action') {
        const recorded = await recordScheduleOutcome({
          scheduleId,
          scheduledFor: job.metadata.scheduledFor,
          status: 'interrupted',
          conversationId: jobStreamId,
        });
        // Reconcile only scans ACTIVE runs, so once the run is terminal nothing else
        // would ever reap the retained job.
        if (recorded) {
          await clearScheduledJob(jobStreamId, {
            scheduleId,
            scheduledFor: job.metadata.scheduledFor,
          }).catch((err) =>
            logger.error(`[AgentStream] Failed to clear reconciled job: ${jobStreamId}`, err),
          );
        }
      }

      if (abortResult.persistenceFailed && generationProtocolVersion < GENERATION_PROTOCOL_V2) {
        res.set('Retry-After', '1');
        return res.status(409).json({
          code: 'ABORT_PERSISTENCE_FAILED',
          generationProtocolVersion,
        });
      }

      return res.json({
        success: true,
        aborted: jobStreamId,
        generationProtocolVersion,
        ...(abortResult.persistenceFailed && { persistenceFailed: true }),
        // Steers that never reached an injection boundary — restored client-side
        // as queued chips so the user's words aren't dropped with the abort.
        ...(!abortResult.persistenceFailed &&
          abortResult.pendingSteers?.length > 0 && { pendingSteers: abortResult.pendingSteers }),
      });
    }

    logger.warn(`[AgentStream] Job not found for streamId: ${jobStreamId}`);
    return sendGenerationJson(
      res,
      404,
      { error: 'Job not found', streamId: jobStreamId },
      requestProtocolVersion,
    );
  } catch (error) {
    logger.error('[AgentStream] Abort request failed', error);
    if (res.headersSent) {
      return next(error);
    }
    return sendGenerationJson(
      res,
      500,
      { code: 'ABORT_FAILED', error: 'Failed to abort generation' },
      responseProtocolVersion,
    );
  }
});

/**
 * @route POST /chat/steer
 * @desc Queue a mid-run user message for injection at the next tool boundary
 * @access Private
 * @description Mounted before chatRouter to bypass buildEndpointOption middleware,
 * but a steer is model-bound user text, so it carries the same guards as a normal
 * message IN THE SAME ORDER as chat.js: the configured IP/user rate limiters,
 * the PII filter FIRST (blocked sensitive text must never reach the external
 * moderation endpoint), then `moderateText`.
 */
const steerLimiters = [];
if (isEnabled(LIMIT_MESSAGE_IP)) {
  steerLimiters.push(unless(exemptAgentTriggerFromIpLimiter, messageIpLimiter));
}
if (isEnabled(LIMIT_MESSAGE_USER)) {
  steerLimiters.push(messageUserLimiter);
}
router.post(
  '/chat/steer',
  configMiddleware,
  ...steerLimiters,
  createMessageFilterPii({ getConfig: (req) => req.config?.messageFilter?.pii }),
  moderateText,
  SteerController,
);

/**
 * @route POST /chat/steer/deliver
 * @desc Strict, idempotent steer admission for trusted event-delivery hosts
 * @access Private
 * @description Uses the same text-admission chain as an interactive steer,
 * then requires a v2 durable receipt and exact originating-agent identity.
 */
router.post(
  '/chat/steer/deliver',
  configMiddleware,
  ...steerLimiters,
  createMessageFilterPii({ getConfig: (req) => req.config?.messageFilter?.pii }),
  moderateText,
  SteerController.SteerDeliveryController,
);

/**
 * @route POST /chat/steer/cancel
 * @desc Remove a still-queued steer before injection (no model-bound content,
 * so no PII/moderation pass — just the shared rate limiters)
 * @access Private
 */
router.post(
  '/chat/steer/cancel',
  configMiddleware,
  ...steerLimiters,
  SteerController.SteerCancelController,
);

/**
 * @route POST /chat/steer/arm
 * @desc Escalate a still-queued steer to an interrupt in place (no new
 * model-bound content, so no PII/moderation pass — just the shared limiters)
 * @access Private
 */
router.post(
  '/chat/steer/arm',
  configMiddleware,
  ...steerLimiters,
  SteerController.SteerArmController,
);

router.use('/', v1);

const chatRouter = express.Router();
// Verify the scheduled-fire token identity as EARLY as possible — right after the
// global auth middleware, before configMiddleware, the interactive limiters, and
// the slower chat chain can outlast the short-lived fire token. Everything
// downstream (limiter exemption, the controller) reads this captured flag instead
// of re-verifying a token that may have expired in-flight, which would otherwise
// throttle/limit a legitimate fire and record schedule errors toward auto-disable.
chatRouter.use(configMiddleware);

/** Applies `limiter` unless `isExempt` says this fire should skip it. */
const unless = (isExempt, limiter) => (req, res, next) =>
  isExempt(req) ? next() : limiter(req, res, next);

if (isEnabled(LIMIT_MESSAGE_IP)) {
  chatRouter.use(unless(exemptAgentTriggerFromIpLimiter, messageIpLimiter));
}

if (isEnabled(LIMIT_MESSAGE_USER)) {
  chatRouter.use(unless(exemptFromUserLimiter, messageUserLimiter));
}

chatRouter.use('/', chat);
router.use('/chat', chatRouter);

module.exports = router;
