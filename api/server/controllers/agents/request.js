const { logger, tenantStorage } = require('@librechat/data-schemas');
const { v5: uuidv5 } = require('uuid');
const {
  Constants,
  EModelEndpoint,
  ViolationTypes,
  isEphemeralAgentId,
} = require('librechat-data-provider');
const {
  sendEvent,
  toPendingSteer,
  getViolationInfo,
  buildMessageFiles,
  getReferencedQuotes,
  resolveTitleTiming,
  GenerationJobManager,
  filterPersistableAbortContent,
  decrementPendingRequest,
  sanitizeMessageForTransmit,
  checkAndIncrementPendingRequest,
  isUnpersistedPreliminaryParent,
  resolveConversationAnchor,
  getAgentStartupTelemetry,
  acceptAgentStartupTelemetry,
  isSteerPreemptSupported,
  buildRecoveredSteerPayload,
  deleteAgentCheckpoint,
} = require('@librechat/api');
const { disposeClient, clientRegistry, requestDataMap } = require('~/server/cleanup');
const {
  getMCPRequestContext,
  cleanupMCPRequestContextForReq,
} = require('~/server/services/MCPRequestContext');
const { handleAbortError } = require('~/server/middleware');
const { logViolation } = require('~/cache');
const { saveMessage, getMessages, getConvo } = require('~/models');
const {
  GENERATION_PROTOCOL_HEADER,
  GENERATION_PROTOCOL_V2,
  negotiateNewGenerationProtocol,
  negotiateExistingGenerationProtocol,
} = require('./protocol');

function sendGenerationJson(res, status, body, generationProtocolVersion) {
  if (typeof res.set === 'function') {
    res.set(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
  } else if (typeof res.setHeader === 'function') {
    res.setHeader(GENERATION_PROTOCOL_HEADER, String(generationProtocolVersion));
  }
  return res.status(status).json({ ...body, generationProtocolVersion });
}

function createCloseHandler(abortController) {
  return function (manual) {
    if (!manual) {
      logger.debug('[AgentController] Request closed');
    }
    if (!abortController) {
      return;
    } else if (abortController.signal.aborted) {
      return;
    } else if (abortController.requestCompleted) {
      return;
    }

    abortController.abort();
    logger.debug('[AgentController] Request aborted on close');
  };
}

function resolveConversationCreatedAt({ userId, conversationId, isNewConvo }) {
  return resolveConversationAnchor({
    isNewConversation: isNewConvo,
    loadConversation: () => getConvo(userId, conversationId),
    onLoadError: (error) => {
      logger.warn('[AgentController] Failed to resolve conversation timestamp anchor', {
        conversationId,
        error: error.message,
      });
    },
  });
}

async function attachConversationCreatedAt(req, conversationId, conversationAnchorPromise) {
  req.body.conversationId = conversationId;
  const resolved = await conversationAnchorPromise;
  req.conversationCreatedAt = resolved.createdAt;
  if (resolved.conversation !== undefined) {
    req.resolvedConversation = resolved.conversation ?? null;
  }
}

function getPreliminaryResponseMessageId({ messageId, responseMessageId }) {
  if (typeof responseMessageId === 'string' && responseMessageId.length > 0) {
    return responseMessageId;
  }

  if (typeof messageId !== 'string' || messageId.length === 0) {
    return null;
  }

  return `${messageId.replace(/_+$/, '')}_`;
}

function getPreliminaryUserMessage(
  { messageId, parentMessageId, text, quotes, files, manualSkills, alwaysAppliedSkills },
  conversationId,
) {
  if (typeof messageId !== 'string' || messageId.length === 0) {
    return null;
  }

  /**
   * Seed normalized quotes here too: if the user aborts before `sendMessage`
   * reaches `onStart` (during init/tool loading), `abortMiddleware` falls back
   * to this preliminary metadata, which must carry the excerpts so the stopped
   * turn keeps its `MessageQuotes`.
   */
  const referencedQuotes = getReferencedQuotes(quotes);

  return {
    messageId,
    parentMessageId,
    conversationId,
    text,
    ...(referencedQuotes != null && { quotes: referencedQuotes }),
    // Persist the turn's uploaded files on this AWAITED preliminary write so they land on
    // job.metadata.userMessage BEFORE the run can reach its first interrupt. onStart's
    // later writes are fire-and-forget, so a fast approval could otherwise read the job
    // and resume an approved code/read-file tool without the paused turn's uploads.
    ...(Array.isArray(files) && files.length > 0 && { files }),
    // Carry skill selections so a HITL-resumed turn's reconstructed `requestMessage`
    // keeps its skill pills — the client's final handler replaces the user bubble from
    // this object, and they'd otherwise vanish until a full reload refetches the row.
    ...(Array.isArray(manualSkills) && manualSkills.length > 0 && { manualSkills }),
    ...(Array.isArray(alwaysAppliedSkills) &&
      alwaysAppliedSkills.length > 0 && { alwaysAppliedSkills }),
  };
}

function getRequestModelSpec(req, endpointOption) {
  const spec = endpointOption?.spec ?? req.body?.spec;
  if (typeof spec !== 'string' || spec.length === 0) {
    return;
  }

  const list = req.config?.modelSpecs?.list;
  if (!Array.isArray(list)) {
    return;
  }

  return list.find((modelSpec) => modelSpec?.name === spec);
}

function getModelSpecIconURL(modelSpec) {
  return modelSpec?.iconURL ?? modelSpec?.preset?.iconURL ?? modelSpec?.preset?.endpoint ?? '';
}

function getEndpointIconURL(req, endpointOption) {
  const iconURL =
    endpointOption?.iconURL ?? getModelSpecIconURL(getRequestModelSpec(req, endpointOption));
  return iconURL || undefined;
}

function getEndpointResponseModel(endpointOption) {
  return endpointOption?.modelOptions?.model || endpointOption?.model_parameters?.model;
}

function getAgentResponseModel(req, endpointOption) {
  const agentId = endpointOption?.agent_id || req.body?.agent_id;
  if (typeof agentId === 'string' && agentId.length > 0 && !isEphemeralAgentId(agentId)) {
    return agentId;
  }

  return getEndpointResponseModel(endpointOption);
}

async function finishResumableRequest(req, userId) {
  try {
    await cleanupMCPRequestContextForReq(req);
  } finally {
    await decrementPendingRequest(userId);
  }
}

const JOB_RECORD_WAIT_ATTEMPTS = 5;
const JOB_RECORD_WAIT_DELAY_MS = 60;

// A winner writes its job record within a few ms of claiming; if a losing duplicate still
// sees no job within this window of the claim, the winner is still starting (retry rather
// than hand back a stream that would 404). Past it, a missing job means the original
// already completed and was cleaned up (attach and let the client refetch).
const IDEMPOTENCY_STARTUP_GRACE_MS = 5000;
const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
/** New-chat retries do not carry a conversation id, so derive the stream id
 * from their stable per-submission id. This keeps both the dedupe key and the
 * Redis hash slot identical across a lost-response retry. */
const NEW_CONVERSATION_IDEMPOTENCY_NAMESPACE = 'd7f2518c-94b8-4fe8-97ad-2d4bdb2c9f43';

function isValidGenerationClaim(value, streamId, conversationId, requireStarted = false) {
  return (
    value != null &&
    typeof value === 'object' &&
    value.streamId === streamId &&
    value.conversationId === conversationId &&
    Number.isSafeInteger(value.claimedAt) &&
    value.claimedAt >= 0 &&
    typeof value.claimToken === 'string' &&
    value.claimToken.length > 0 &&
    value.claimToken.length <= 128 &&
    (value.generationProtocolVersion == null ||
      value.generationProtocolVersion === 1 ||
      value.generationProtocolVersion === GENERATION_PROTOCOL_V2) &&
    (value.startedAt == null || (Number.isSafeInteger(value.startedAt) && value.startedAt >= 0)) &&
    (!requireStarted || value.startedAt != null)
  );
}

/** Pre-bridge servers wrote the legacy global key without a claim token and,
 * for a new conversation, chose a random stream before claiming it. Accept
 * only that tightly bounded legacy shape: existing conversations must still
 * match the requested stream exactly; new-chat claims may point to the old
 * random stream only when streamId === conversationId. Ownership is verified
 * against the live job before attachment. */
function isValidLegacyGenerationClaim(value, streamId, isNewConvo) {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof value.streamId === 'string' &&
    value.streamId.length > 0 &&
    value.streamId.length <= 512 &&
    value.conversationId === value.streamId &&
    (isNewConvo || value.streamId === streamId) &&
    Number.isSafeInteger(value.claimedAt) &&
    value.claimedAt >= 0 &&
    value.claimToken == null &&
    value.startedAt == null &&
    (value.generationProtocolVersion == null || value.generationProtocolVersion === 1)
  );
}

/** Store corruption must not turn a user-scoped idempotency claim into a
 * pointer to another user's/tenant's live stream. Missing tenant metadata is
 * kept as the explicit legacy case, but missing ownership never authorizes. */
function liveJobBelongsToRequester(job, user) {
  return (
    job?.metadata?.userId === user.id &&
    (job.metadata?.tenantId == null || job.metadata.tenantId === user.tenantId)
  );
}

/**
 * Poll briefly for a job record to appear. A deduped retry that loses the idempotency
 * claim must not be handed the winner's stream until its job exists, or the client's
 * subscribe 404s terminally. The winner writes the record a few ms after claiming.
 */
async function waitForJobRecord(streamId) {
  for (let attempt = 0; attempt < JOB_RECORD_WAIT_ATTEMPTS; attempt++) {
    const job = await GenerationJobManager.getJob(streamId);
    if (job) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_RECORD_WAIT_DELAY_MS));
  }
  return GenerationJobManager.getJob(streamId);
}

/** The claimed generation already reached durable/terminal history, but its
 * conversation stream id now belongs to no job or to a newer submission. A
 * success shape with that streamId would attach the stale submission to the
 * replacement, so tell the client to refetch without opening SSE. */
function sendSettledGeneration(
  res,
  streamId,
  conversationId,
  startupTelemetry,
  generationProtocolVersion,
) {
  startupTelemetry?.end('deduplicated');
  if (generationProtocolVersion < GENERATION_PROTOCOL_V2) {
    return sendGenerationJson(
      res,
      200,
      { streamId, conversationId, status: 'resumed' },
      generationProtocolVersion,
    );
  }
  return sendGenerationJson(
    res,
    200,
    { conversationId, status: 'settled' },
    generationProtocolVersion,
  );
}

function rejectPreliminaryParentMessageId(res, generationProtocolVersion) {
  return sendGenerationJson(
    res,
    409,
    {
      error:
        'Cannot submit a follow-up while the selected parent response is still being saved. Please wait and try again.',
    },
    generationProtocolVersion,
  );
}

/**
 * Resumable Agent Controller - Generation runs independently of HTTP connection.
 * Returns streamId immediately, client subscribes separately via SSE.
 */
const ResumableAgentController = async (req, res, next, initializeClient, addTitle) => {
  const startupTelemetry = getAgentStartupTelemetry(req);
  let generationProtocolVersion = negotiateNewGenerationProtocol(req, GenerationJobManager);
  const {
    text,
    isRegenerate,
    endpointOption,
    conversationId: reqConversationId,
    isContinued = false,
    editedContent = null,
    parentMessageId = null,
    overrideParentMessageId = null,
    responseMessageId: editedResponseMessageId = null,
  } = req.body;

  const userId = req.user.id;
  const tenantId = req.user.tenantId;
  const rawClientRequestId = req.body?.clientRequestId;
  if (
    rawClientRequestId != null &&
    (typeof rawClientRequestId !== 'string' || !CLIENT_REQUEST_ID_PATTERN.test(rawClientRequestId))
  ) {
    startupTelemetry?.end('rejected');
    return sendGenerationJson(
      res,
      400,
      {
        code: 'INVALID_CLIENT_REQUEST_ID',
        error: 'clientRequestId must be a 1-128 character identifier.',
      },
      generationProtocolVersion,
    );
  }
  const clientRequestId = rawClientRequestId;
  const rawExpectedPredecessorCreatedAt = req.body?.expectedPredecessorCreatedAt;
  if (
    rawExpectedPredecessorCreatedAt != null &&
    (!Number.isSafeInteger(rawExpectedPredecessorCreatedAt) || rawExpectedPredecessorCreatedAt < 0)
  ) {
    startupTelemetry?.end('rejected');
    return sendGenerationJson(
      res,
      400,
      {
        code: 'INVALID_GENERATION_PREDECESSOR',
        error: 'expectedPredecessorCreatedAt must be a non-negative safe integer.',
      },
      generationProtocolVersion,
    );
  }
  const expectedPredecessorCreatedAt = rawExpectedPredecessorCreatedAt;
  const legacyRecoveredSteerId =
    clientRequestId?.startsWith('steer-recovery:') === true
      ? clientRequestId.slice('steer-recovery:'.length)
      : undefined;
  const explicitRecoveredSteerId = req.body?.recoverySteerId;
  const invalidExplicitRecoveryId =
    explicitRecoveredSteerId != null &&
    (typeof explicitRecoveredSteerId !== 'string' ||
      !CLIENT_REQUEST_ID_PATTERN.test(explicitRecoveredSteerId));
  const mismatchedRecoveryIds =
    explicitRecoveredSteerId != null &&
    legacyRecoveredSteerId != null &&
    explicitRecoveredSteerId !== legacyRecoveredSteerId;
  if (invalidExplicitRecoveryId || mismatchedRecoveryIds) {
    startupTelemetry?.end('rejected');
    return sendGenerationJson(
      res,
      400,
      {
        code: 'INVALID_RECOVERY_REQUEST',
        error: 'recoverySteerId must identify exactly one parked steer source.',
      },
      generationProtocolVersion,
    );
  }
  const recoveredSteerId = explicitRecoveredSteerId ?? legacyRecoveredSteerId;
  const isRecoveredSteerRequest = recoveredSteerId != null;
  const recoveryUserMessageId = req.body?.overrideUserMessageId;
  const recoveredSteerPayload = isRecoveredSteerRequest
    ? buildRecoveredSteerPayload(text, req.body?.files)
    : undefined;
  /** A recovered steer is handed off as a new ordinary user turn. Edit,
   * regenerate, continue, and arbitrary override-id shapes can reuse an
   * existing user row (or deliberately skip its save); consuming the parked
   * source from one of those shapes would therefore erase the only durable
   * copy of the recovered words without proving that a new user row contains
   * them. The source steer id itself is the one permitted user-row override:
   * retries intentionally upsert that stable recovery row while each
   * generation attempt uses a fresh clientRequestId. */
  if (
    isRecoveredSteerRequest &&
    (!clientRequestId ||
      !recoveredSteerId ||
      !recoveredSteerPayload ||
      !!isRegenerate ||
      !!isContinued ||
      editedContent != null ||
      overrideParentMessageId != null ||
      editedResponseMessageId != null ||
      (recoveryUserMessageId != null && recoveryUserMessageId !== recoveredSteerId) ||
      !!req.body?.overrideConvoId)
  ) {
    startupTelemetry?.end('rejected');
    return sendGenerationJson(
      res,
      400,
      {
        code: 'INVALID_RECOVERY_REQUEST',
        error: 'A recovered steer must be submitted as a new user turn.',
      },
      generationProtocolVersion,
    );
  }
  if (isRecoveredSteerRequest && recoveryUserMessageId === recoveredSteerId) {
    /** BaseClient treats a bare override id as an already-persisted row and
     * skips its save. Recovery instead needs an idempotent upsert: preserve
     * the source-derived row id while explicitly selecting save index zero. */
    req.body.overrideUserMessageId = `${recoveredSteerId}${Constants.COMMON_DIVIDER}0`;
  }
  const isNewConvo = !reqConversationId || reqConversationId === 'new';
  let conversationId = reqConversationId;
  if (isNewConvo) {
    conversationId =
      typeof clientRequestId === 'string' && clientRequestId.length > 0
        ? uuidv5(`${userId}:${clientRequestId}`, NEW_CONVERSATION_IDEMPOTENCY_NAMESPACE)
        : crypto.randomUUID();
  }
  const conversationAnchorPromise = resolveConversationCreatedAt({
    userId,
    conversationId,
    isNewConvo,
  });

  if (
    await isUnpersistedPreliminaryParent({
      userId,
      conversationId: reqConversationId,
      parentMessageId,
      getMessages,
    })
  ) {
    startupTelemetry?.end('rejected');
    return rejectPreliminaryParentMessageId(res, generationProtocolVersion);
  }

  /** When to generate the conversation title. `immediate` (default) fires title
   *  generation in parallel with the response, from the user's first message;
   *  `final` defers it until the full response completes (legacy behavior).
   *  Resolved from the agent's actual endpoint once the client is initialized. */
  let titleTiming = 'immediate';

  // Generate conversationId upfront if not provided - streamId === conversationId always
  // Treat "new" as a placeholder that needs a real UUID (frontend may send "new" for new convos)
  const streamId = conversationId;
  req.body.conversationId = conversationId;

  // Idempotency: a lost/reset start-generation response makes the client re-POST the
  // identical payload, which would otherwise start a second fully-billed generation.
  // Claim the submission's clientRequestId before creating the job so a retry attaches
  // to the original stream instead of spawning a duplicate. Runs before the concurrency
  // check so a deduped retry is never counted against the limiter. Once a
  // stable id is present, an ambiguous store outcome must fail closed.
  let ownedIdempotencyClaim = null;
  if (clientRequestId) {
    let claim = null;
    try {
      claim = await GenerationJobManager.claimGeneration(
        userId,
        clientRequestId,
        streamId,
        conversationId,
        generationProtocolVersion,
      );
    } catch (err) {
      logger.error(
        '[ResumableAgentController] Idempotency claim outcome is unknown; asking the client to retry',
        err,
      );
      res.set('Retry-After', '1');
      startupTelemetry?.end('deduplicated');
      return sendGenerationJson(
        res,
        503,
        {
          code: 'SERVER_NOT_READY',
          error: 'Generation ownership could not be confirmed. Please retry shortly.',
        },
        generationProtocolVersion,
      );
    }

    if (claim?.existing != null) {
      generationProtocolVersion = Math.min(
        generationProtocolVersion,
        claim.existing.generationProtocolVersion === GENERATION_PROTOCOL_V2
          ? GENERATION_PROTOCOL_V2
          : 1,
      );
    }

    const isLegacyTokenlessClaim =
      claim?.source === 'legacy' && claim?.existing != null && claim.existing.claimToken == null;
    const validClaim = isLegacyTokenlessClaim
      ? isValidLegacyGenerationClaim(claim.existing, streamId, isNewConvo)
      : isValidGenerationClaim(claim?.existing, streamId, conversationId);
    if (claim?.existing != null && !validClaim) {
      logger.error('[ResumableAgentController] Invalid or miscorrelated idempotency claim');
      res.set('Retry-After', '1');
      startupTelemetry?.end('deduplicated');
      return sendGenerationJson(
        res,
        503,
        {
          code: 'SERVER_NOT_READY',
          error: 'Generation ownership could not be confirmed. Please retry shortly.',
        },
        generationProtocolVersion,
      );
    }

    if (claim?.claimed && claim.existing?.claimToken) {
      ownedIdempotencyClaim = claim.existing;
      try {
        const existingLiveGeneration = await GenerationJobManager.resumeClaimedGeneration(
          userId,
          clientRequestId,
          streamId,
          ownedIdempotencyClaim,
        );
        if (
          existingLiveGeneration &&
          isValidGenerationClaim(existingLiveGeneration, streamId, conversationId, true)
        ) {
          // A fresh lease may have been negotiated under a different rollout
          // cap than the still-live job it was atomically rebound to. The
          // job's immutable protocol wins; echoing the fresh request's marker
          // would make the client use v2-only recovery against a v1 run (or
          // unnecessarily downgrade a v2 run).
          generationProtocolVersion = Math.min(
            generationProtocolVersion,
            existingLiveGeneration.generationProtocolVersion === GENERATION_PROTOCOL_V2
              ? GENERATION_PROTOCOL_V2
              : 1,
          );
          startupTelemetry?.end('deduplicated');
          return sendGenerationJson(
            res,
            200,
            {
              streamId: existingLiveGeneration.streamId,
              conversationId: existingLiveGeneration.conversationId,
              generationCreatedAt: existingLiveGeneration.startedAt,
              status: 'resumed',
            },
            generationProtocolVersion,
          );
        } else if (existingLiveGeneration) {
          throw new Error('Live generation idempotency adoption returned invalid ownership');
        }
      } catch (err) {
        logger.error('[ResumableAgentController] Live generation idempotency adoption failed', err);
        res.set('Retry-After', '1');
        startupTelemetry?.end('deduplicated');
        return sendGenerationJson(
          res,
          503,
          {
            code: 'SERVER_NOT_READY',
            error: 'Generation ownership changed. Please retry shortly.',
          },
          generationProtocolVersion,
        );
      }
    } else if (claim?.existing) {
      // A duplicate is confirmed. Attach to the original stream — and never fall through to
      // a second generation, even if the job lookup hiccups.
      const existingStreamId = claim.existing.streamId;
      let liveJob;
      try {
        // Wait briefly for the winner to write the job record (it does so a few ms after
        // claiming) so a still-live stream isn't handed back before its job exists.
        liveJob = await waitForJobRecord(existingStreamId);
      } catch (err) {
        // Store hiccup while checking the job: ask the client to retry rather than starting
        // a second generation for a request we know is a duplicate.
        logger.error(
          '[ResumableAgentController] Job lookup failed for an existing claim; asking the client to retry',
          err,
        );
        res.set('Retry-After', '1');
        startupTelemetry?.end('deduplicated');
        return sendGenerationJson(
          res,
          503,
          {
            code: 'SERVER_NOT_READY',
            error: 'Generation is still starting. Please retry shortly.',
          },
          generationProtocolVersion,
        );
      }
      const claimAgeMs = Date.now() - (claim.existing.claimedAt ?? 0);
      if (!liveJob && claim.existing.startedAt != null) {
        // createJob marked this claim in the same transaction that installed
        // the job. A now-missing record therefore represents an already-owned
        // generation (usually fast completion + cleanup), never an abandoned
        // pre-create lease that may be taken over and billed again. There is no
        // attachable stream; the settled response refetches persisted history.
        return sendSettledGeneration(
          res,
          existingStreamId,
          claim.existing.conversationId,
          startupTelemetry,
          generationProtocolVersion,
        );
      }
      if (!liveJob && isLegacyTokenlessClaim && claimAgeMs >= IDEMPOTENCY_STARTUP_GRACE_MS) {
        /** A legacy owner cannot be fenced (its value has no token), so it is
         * never safe to take over. Return its original stream on the legacy
         * attach/refetch path: this covers fast completion without starting a
         * second billed generation, while an abandoned pre-create claim ages
         * out under the old server's bounded TTL. */
        return sendSettledGeneration(
          res,
          existingStreamId,
          claim.existing.conversationId,
          startupTelemetry,
          generationProtocolVersion,
        );
      }
      if (!liveJob && claimAgeMs < IDEMPOTENCY_STARTUP_GRACE_MS) {
        // The winner claimed but has not written the job yet (still between claim and
        // createJob). Handing back the stream now would 404 and tear down the client while
        // the winner goes on to generate and bill with no UI attached — ask the client to
        // retry via the readiness path instead.
        res.set('Retry-After', '1');
        startupTelemetry?.end('deduplicated');
        return sendGenerationJson(
          res,
          503,
          {
            code: 'SERVER_NOT_READY',
            error: 'Generation is still starting. Please retry shortly.',
          },
          generationProtocolVersion,
        );
      }
      if (liveJob) {
        generationProtocolVersion = negotiateExistingGenerationProtocol(req, liveJob);
        if (!liveJobBelongsToRequester(liveJob, req.user)) {
          logger.error(
            '[ResumableAgentController] Existing idempotency claim resolved to a foreign generation',
          );
          res.set('Retry-After', '1');
          startupTelemetry?.end('deduplicated');
          return sendGenerationJson(
            res,
            503,
            {
              code: 'SERVER_NOT_READY',
              error: 'Generation ownership could not be confirmed. Please retry shortly.',
            },
            generationProtocolVersion,
          );
        }
        const liveClientRequestId = liveJob.metadata?.idempotencyClientRequestId;
        const startedAt = claim.existing.startedAt;
        if (liveJob.metadata?.terminalPersistencePending === true) {
          /** The terminal owner has claimed the outcome but has not yet
           * finished the required persistence hook. Do not let a duplicate
           * start refetch history until that single-winner publication is
           * finalized (or stale-pending recovery publishes failure). */
          res.set('Retry-After', '1');
          startupTelemetry?.end('deduplicated');
          return sendGenerationJson(
            res,
            503,
            {
              code: 'SERVER_NOT_READY',
              error: 'Generation is finalizing. Please retry shortly.',
            },
            generationProtocolVersion,
          );
        }
        const terminalWithoutPayload =
          ['complete', 'error', 'aborted'].includes(liveJob.status) &&
          !liveJob.finalEvent &&
          !liveJob.error;
        if (terminalWithoutPayload) {
          /** A terminal CAS can precede its required DB save and durable FINAL
           * by a narrow window. Returning an attachable/settled success here
           * lets the retry refetch before persistence is complete. Keep the
           * duplicate on the readiness path until the owner publishes its
           * terminal payload (or cleanup makes the job disappear). */
          res.set('Retry-After', '1');
          startupTelemetry?.end('deduplicated');
          return sendGenerationJson(
            res,
            503,
            {
              code: 'SERVER_NOT_READY',
              error: 'Generation is finalizing. Please retry shortly.',
            },
            generationProtocolVersion,
          );
        }
        const replacedGeneration =
          (startedAt != null && liveJob.createdAt !== startedAt) ||
          (liveClientRequestId != null && liveClientRequestId !== clientRequestId);
        if (replacedGeneration) {
          // streamId === conversationId, so a later turn reuses the same route.
          // Never pair this stale POST's optimistic submission with that newer
          // job's SSE snapshot. If the replacement is still active, distinguish
          // it from an ordinary settled retry so the client hands off to the
          // authoritative B submission instead of going idle and starting C.
          if (liveJob.status === 'running' || liveJob.status === 'requires_action') {
            startupTelemetry?.end('deduplicated');
            if (generationProtocolVersion < GENERATION_PROTOCOL_V2) {
              return sendGenerationJson(
                res,
                409,
                { code: 'RUN_REPLACED' },
                generationProtocolVersion,
              );
            }
            return sendGenerationJson(
              res,
              200,
              {
                streamId: existingStreamId,
                conversationId: claim.existing.conversationId,
                generationCreatedAt: liveJob.createdAt,
                status: 'replaced',
              },
              generationProtocolVersion,
            );
          }
          return sendSettledGeneration(
            res,
            existingStreamId,
            claim.existing.conversationId,
            startupTelemetry,
            generationProtocolVersion,
          );
        }
        if (liveClientRequestId == null && !isLegacyTokenlessClaim) {
          // A syntactically valid claim plus an uncorrelated live job is
          // outcome-ambiguous (legacy/corrupt/partially written state). Attaching
          // risks cross-wiring two submissions; starting risks double billing.
          res.set('Retry-After', '1');
          startupTelemetry?.end('deduplicated');
          return sendGenerationJson(
            res,
            503,
            {
              code: 'SERVER_NOT_READY',
              error: 'Generation ownership could not be confirmed. Please retry shortly.',
            },
            generationProtocolVersion,
          );
        }
        logger.debug('[ResumableAgentController] Deduped retried start-generation request', {
          userId,
          clientRequestId,
          streamId: existingStreamId,
        });
        startupTelemetry?.end('deduplicated');
        return sendGenerationJson(
          res,
          200,
          {
            streamId: existingStreamId,
            conversationId: claim.existing.conversationId,
            generationCreatedAt: liveJob.createdAt,
            status: 'resumed',
          },
          generationProtocolVersion,
        );
      }

      // The creator held the claim beyond the startup grace but never made a
      // job. Atomically take over its lease; createJob verifies this token in
      // the same Redis transaction as job creation, so the abandoned winner
      // can no longer wake up and start a second generation.
      const takeover = await GenerationJobManager.takeoverGeneration(
        userId,
        clientRequestId,
        existingStreamId,
        claim.existing,
      ).catch((err) => {
        logger.error('[ResumableAgentController] Stale idempotency takeover failed', err);
        return null;
      });
      if (
        !takeover?.claimed ||
        !isValidGenerationClaim(takeover.existing, streamId, conversationId)
      ) {
        res.set('Retry-After', '1');
        startupTelemetry?.end('deduplicated');
        return sendGenerationJson(
          res,
          503,
          {
            code: 'SERVER_NOT_READY',
            error: 'Generation ownership changed. Please retry shortly.',
          },
          generationProtocolVersion,
        );
      }
      ownedIdempotencyClaim = takeover.existing;
    } else {
      // A malformed/unreadable existing claim is outcome-ambiguous. Starting
      // anyway would turn a store parsing failure into duplicate generation.
      res.set('Retry-After', '1');
      startupTelemetry?.end('deduplicated');
      return sendGenerationJson(
        res,
        503,
        {
          code: 'SERVER_NOT_READY',
          error: 'Generation ownership could not be confirmed. Please retry shortly.',
        },
        generationProtocolVersion,
      );
    }
  }

  const { allowed, pendingRequests, limit } = await checkAndIncrementPendingRequest(userId);
  if (!allowed) {
    if (ownedIdempotencyClaim) {
      await GenerationJobManager.releaseGeneration(
        userId,
        clientRequestId,
        streamId,
        ownedIdempotencyClaim,
      ).catch(() => {});
    }
    const violationInfo = getViolationInfo(pendingRequests, limit);
    await logViolation(req, res, ViolationTypes.CONCURRENT, violationInfo, violationInfo.score);
    startupTelemetry?.end('rejected');
    return sendGenerationJson(res, 429, violationInfo, generationProtocolVersion);
  }
  startupTelemetry?.mark('request_admitted');

  let client = null;
  let jobCreatedAt;

  try {
    logger.debug(`[ResumableAgentController] Creating job`, {
      streamId,
      conversationId,
      reqConversationId,
      userId,
    });

    const endpointIconURL = getEndpointIconURL(req, endpointOption);
    const responseModel = getAgentResponseModel(req, endpointOption);
    const preliminaryUserMessage = getPreliminaryUserMessage(req.body, conversationId);
    const preliminaryResponseMessageId = getPreliminaryResponseMessageId(req.body);
    const job = await GenerationJobManager.createJob(streamId, userId, conversationId, {
      startupTelemetry,
      ...(recoveredSteerId && { recoveredSteerId }),
      ...(recoveredSteerPayload && { recoveredSteerPayload }),
      ...(expectedPredecessorCreatedAt != null && { expectedPredecessorCreatedAt }),
      ...(ownedIdempotencyClaim?.claimToken && {
        idempotencyClientRequestId: clientRequestId,
        idempotencyClaimToken: ownedIdempotencyClaim.claimToken,
      }),
      initialMetadata: {
        conversationId,
        generationProtocolVersion,
        endpoint: endpointOption.endpoint,
        iconURL: endpointIconURL,
        model: responseModel,
        // Recorded HERE because this process owns the generation: the steer
        // route may land on a different replica whose own SDK probe would
        // answer for the wrong process during a rolling deploy.
        preemptCapable: isSteerPreemptSupported(),
        // Persist the originating agent so a HITL resume can refuse to rebuild this
        // paused run on a different agent (see resume.js).
        agent_id: endpointOption.agent_id ?? req.body?.agent_id,
        // Persist temporary-chat state so a HITL resume keeps the resumed response
        // non-persisted instead of trusting the resume request to re-send the flag.
        isTemporary: req.body?.isTemporary,
        responseMessageId: preliminaryResponseMessageId,
        userMessage: preliminaryUserMessage,
      },
    });
    startupTelemetry?.mark('job_created');
    acceptAgentStartupTelemetry(req, streamId);
    startupTelemetry?.mark('metadata_persisted');
    generationProtocolVersion = negotiateExistingGenerationProtocol(req, job);
    jobCreatedAt = job.createdAt; // Capture creation time to detect job replacement
    req._resumableStreamId = streamId;
    getMCPRequestContext(req, undefined, { cleanupOnResponse: false });
    let recoveredSteerCommitted = false;
    const commitRecoveredSteer = async () => {
      if (!recoveredSteerId || recoveredSteerCommitted) {
        return;
      }
      if (client?.skipSaveUserMessage) {
        throw new Error('Recovered steer cannot skip user message persistence');
      }
      const committed = await GenerationJobManager.steering.consumeRecovered(
        streamId,
        recoveredSteerId,
        { userId, tenantId: req.user?.tenantId },
        jobCreatedAt,
      );
      if (!committed) {
        throw new Error('Recovered steer could not be committed after message persistence');
      }
      recoveredSteerCommitted = true;
    };

    // Send JSON response IMMEDIATELY so client can connect to SSE stream
    // This is critical: tool loading (MCP OAuth) may emit events that the client needs to receive
    sendGenerationJson(
      res,
      200,
      { streamId, conversationId, generationCreatedAt: jobCreatedAt, status: 'started' },
      generationProtocolVersion,
    );

    await attachConversationCreatedAt(req, conversationId, conversationAnchorPromise).then(() =>
      startupTelemetry?.mark('conversation_resolved'),
    );

    // Note: We no longer use res.on('close') to abort since we send JSON immediately.
    // The response closes normally after res.json(), which is not an abort condition.
    // Abort handling is done through GenerationJobManager via the SSE stream connection.

    // Track if partial response was already saved to avoid duplicates
    let partialResponseSaved = false;

    /**
     * Listen for all subscribers leaving to save partial response.
     * This ensures the response is saved to DB even if all clients disconnect
     * while generation continues.
     *
     * Note: The messageId used here falls back to `${userMessage.messageId}_` if the
     * actual response messageId isn't available yet. The final response save will
     * overwrite this with the complete response using the same messageId pattern.
     */
    job.emitter.on('allSubscribersLeft', async (aggregatedContent) => {
      if (partialResponseSaved || !aggregatedContent || aggregatedContent.length === 0) {
        return;
      }

      const persistableContent = filterPersistableAbortContent(aggregatedContent);
      if (persistableContent.length === 0) {
        logger.debug('[ResumableAgentController] No persistable content to save partial response');
        return;
      }

      const resumeState = await GenerationJobManager.getResumeState(streamId, jobCreatedAt);
      if (!resumeState?.userMessage) {
        logger.debug('[ResumableAgentController] No user message to save partial response for');
        return;
      }

      partialResponseSaved = true;
      const responseConversationId = resumeState.conversationId || conversationId;

      try {
        const partialMessage = {
          messageId: resumeState.responseMessageId || `${resumeState.userMessage.messageId}_`,
          conversationId: responseConversationId,
          parentMessageId: resumeState.userMessage.messageId,
          sender: client?.sender ?? 'AI',
          content: persistableContent,
          unfinished: true,
          error: false,
          isCreatedByUser: false,
          user: userId,
          endpoint: endpointOption.endpoint,
          iconURL: resumeState.iconURL || endpointIconURL,
          model: resumeState.model || responseModel,
        };

        if (req.body?.agent_id) {
          partialMessage.agent_id = req.body.agent_id;
        }

        const savePartialMessage = () =>
          saveMessage(
            {
              userId,
              isTemporary: req?.body?.isTemporary,
              interfaceConfig: req?.config?.interfaceConfig,
            },
            partialMessage,
            {
              context: 'api/server/controllers/agents/request.js - partial response on disconnect',
            },
          );

        const savedPartialMessage = tenantId
          ? await tenantStorage.run({ tenantId, userId }, savePartialMessage)
          : await savePartialMessage();
        if (!savedPartialMessage) {
          throw new Error('Partial response could not be persisted after disconnect');
        }

        logger.debug(
          `[ResumableAgentController] Saved partial response for ${streamId}, content parts: ${persistableContent.length}`,
        );
      } catch (error) {
        logger.error('[ResumableAgentController] Error saving partial response:', error);
        // Reset flag so we can try again if subscribers reconnect and leave again
        partialResponseSaved = false;
      }
    });

    /** @type {{ client: TAgentClient; userMCPAuthMap?: Record<string, Record<string, string>> }} */
    const result = await initializeClient({
      req,
      res,
      endpointOption,
      // Use the job's abort controller signal - allows abort via GenerationJobManager.abortJob()
      signal: job.abortController.signal,
      jobCreatedAt,
      checkpointNamespace: job.metadata?.checkpointNamespace,
    });
    startupTelemetry?.mark('client_initialized');
    client = result.client;

    /** Request-shape validation rejects every known edit/regenerate path, but
     * the client owns the final persistence decision. Fail closed if a future
     * or provider-specific path still derives skip-save for a recovered turn;
     * consuming its parked source would otherwise erase the only durable copy
     * of the user's words. Re-checked inside commitRecoveredSteer in case a
     * client mutates the flag while sending. */
    if (recoveredSteerId && client?.skipSaveUserMessage) {
      throw new Error('Recovered steer cannot skip user message persistence');
    }

    if (job.abortController.signal.aborted) {
      await GenerationJobManager.completeJob(
        streamId,
        'Request aborted during initialization',
        jobCreatedAt,
      ).catch((completeErr) => {
        logger.warn(
          '[ResumableAgentController] completeJob failed after initialization abort',
          completeErr,
        );
      });
      startupTelemetry?.end('aborted');
      try {
        await finishResumableRequest(req, userId);
      } finally {
        if (client) {
          disposeClient(client);
        }
        client = null;
      }
      return;
    }

    // Tag the client with THIS generation's identity so HITL terminal side-effects
    // (pause CAS, checkpoint prune) can tell whether a newer request has since replaced
    // this job on the same conversationId before acting on it.
    client.jobCreatedAt = jobCreatedAt;

    // Resolve title timing from the public agents endpoint first, then fall
    // back to the agent's actual backing provider/custom endpoint.
    titleTiming = resolveTitleTiming({
      appConfig: req.config,
      endpoint: [endpointOption?.endpoint, client?.options?.agent?.endpoint],
    });

    if (client?.sender) {
      void GenerationJobManager.updateMetadata(
        streamId,
        { sender: client.sender },
        jobCreatedAt,
      ).catch((err) => {
        logger.warn('[ResumableAgentController] Failed to persist response sender', err);
      });
    }

    // Store reference to client's contentParts - graph will be set when run is created
    if (client?.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts, jobCreatedAt);
    }

    let userMessage;

    const getReqData = (data = {}) => {
      if (data.userMessage) {
        userMessage = data.userMessage;
      }
      // conversationId is pre-generated, no need to update from callback
    };

    let immediateTitlePromise = null;
    let backgroundClientCleanupScheduled = false;
    let terminalClaim = null;
    let terminalClaimFinished = false;
    let terminalPersistenceChecked = false;
    let terminalWasAborted = false;
    let preemptIncomplete = false;
    /** A pause-row write failure is terminalized through the exact action/epoch
     * barrier. Once that path starts, neither generic background error handler
     * may call completeJob: the pause may already have been replaced by a newer
     * action or generation by the time the persistence failure is observed. */
    let pausePersistenceFailed = false;
    const finishOwnedTerminalClaim = async () => {
      if (!terminalClaim || terminalClaimFinished) {
        return;
      }
      try {
        await GenerationJobManager.finishTerminalJob(terminalClaim);
      } finally {
        terminalClaimFinished = true;
      }
    };
    /** Runs inside BaseClient immediately before it can start the completed
     * response write. A lost claim returns false, and BaseClient skips that
     * stale `unfinished:false` write entirely. The fallback invocation below
     * supports test/custom clients that do not derive from BaseClient. */
    const claimBeforeResponsePersistence = async () => {
      if (terminalPersistenceChecked) {
        return terminalClaim != null;
      }
      terminalPersistenceChecked = true;
      if (client?.pendingApproval) {
        // AgentClient installed a durable pause-persistence barrier in the
        // running→requires_action CAS. BaseClient must not start its ordinary
        // `unfinished:false` response write; the HITL branch persists the
        // partial row as unfinished before releasing that barrier.
        return false;
      }
      terminalWasAborted = job.abortController.signal.aborted;
      const preemptStats = client?.run?.getPreemptStats?.();
      preemptIncomplete =
        (preemptStats?.emptyBoundaries ?? 0) > 0 ||
        client?.run?.getHaltReason?.() === 'preempt_incomplete';
      terminalClaim = await GenerationJobManager.claimTerminalJob(
        streamId,
        terminalWasAborted ? 'aborted' : 'complete',
        undefined,
        jobCreatedAt,
        { persistencePending: true },
      );
      return terminalClaim != null;
    };
    const disposeBackgroundClient = () => {
      if (backgroundClientCleanupScheduled) {
        return;
      }
      backgroundClientCleanupScheduled = true;

      if (immediateTitlePromise) {
        immediateTitlePromise.finally(() => {
          if (client) {
            disposeClient(client);
          }
        });
      } else if (client) {
        disposeClient(client);
      }
    };

    // Start background generation immediately. The stream layer buffers and persists events
    // until an SSE subscriber attaches, so generation no longer waits on subscriber readiness.
    const startGeneration = async () => {
      /** Immediate-mode title generation runs in parallel with the response, so
       *  the conversation row may not exist when the title resolves. `convoReady`
       *  resolves once the response (and thus the conversation) has been saved,
       *  gating the title's `saveConvo`. Declared here so both the success tail
       *  and the catch block can settle it and gate `disposeClient` on the title. */
      let titleEventPromise = null;
      let acceptsTitleEvents = true;
      let resolveConvoReady;
      const convoReady = new Promise((resolve) => {
        resolveConvoReady = resolve;
      });
      /** Dedicated controller so a user Stop (or a replaced stream) cancels the
       *  in-flight title — kept separate from `job.abortController`, which
       *  `completeJob` also aborts on *successful* completion and would otherwise
       *  cancel a title that is merely slower than a short response. */
      const titleAbortController = new AbortController();
      /** Separate from `titleAbortController`: a user Stop cancels the in-flight
       *  title model call but keeps a title that already finished generating.
       *  Only a superseded/failed stream aborts this to discard such a title so it
       *  cannot clobber the conversation now owned by the newer run. */
      const titleDiscardController = new AbortController();
      const abortTitleOnJobAbort = () => titleAbortController.abort();
      if (job.abortController.signal.aborted) {
        titleAbortController.abort();
      } else {
        job.abortController.signal.addEventListener('abort', abortTitleOnJobAbort, { once: true });
      }
      const titleEligible =
        addTitle && parentMessageId === Constants.NO_PARENT && isNewConvo && !req.body?.isTemporary;
      const emitTitleEvent = ({ conversationId: titleConversationId, title }) => {
        titleEventPromise = (async () => {
          if (!acceptsTitleEvents || titleAbortController.signal.aborted) {
            return;
          }
          const currentJob = await GenerationJobManager.getJob(streamId);
          if (!currentJob || currentJob.createdAt !== jobCreatedAt) {
            return;
          }
          if (titleAbortController.signal.aborted) {
            return;
          }
          await GenerationJobManager.emitChunk(
            streamId,
            {
              event: 'title',
              data: {
                conversationId: titleConversationId,
                title,
              },
            },
            { expectedCreatedAt: jobCreatedAt },
          );
        })().catch((err) => {
          logger.error('[ResumableAgentController] Error emitting title event', err);
        });
        return titleEventPromise;
      };

      try {
        const onStart = (userMsg, respMsgId, _isNewConvo) => {
          userMessage = userMsg;

          // Store userMessage and responseMessageId upfront for resume capability
          GenerationJobManager.updateMetadata(
            streamId,
            {
              responseMessageId: respMsgId,
              userMessage: {
                messageId: userMsg.messageId,
                parentMessageId: userMsg.parentMessageId,
                conversationId: userMsg.conversationId,
                text: userMsg.text,
                quotes: userMsg.quotes,
                // Persist the turn's uploaded files here (authoritative job metadata) so a
                // HITL resume sources them from the job, not the user DB row — which the
                // approval prompt can race (the row save may still be in flight when a fast
                // /resume reads it). Without this an approved tool run can rebuild without the
                // paused turn's files.
                ...(Array.isArray(req.body?.files) &&
                  req.body.files.length > 0 && { files: req.body.files }),
                // Skill selections aren't on `userMsg` yet at onStart (BaseClient adds them
                // later), so source them from the request — otherwise this update overwrites
                // the preliminary metadata and a HITL-resumed turn loses its skill pills.
                ...(Array.isArray(req.body?.manualSkills) &&
                  req.body.manualSkills.length > 0 && { manualSkills: req.body.manualSkills }),
                ...(Array.isArray(req.body?.alwaysAppliedSkills) &&
                  req.body.alwaysAppliedSkills.length > 0 && {
                    alwaysAppliedSkills: req.body.alwaysAppliedSkills,
                  }),
              },
            },
            jobCreatedAt,
          ).catch((err) => {
            logger.error('[ResumableAgentController] Failed to persist start metadata', err);
          });

          GenerationJobManager.emitChunk(
            streamId,
            {
              created: true,
              // Skill selections aren't on `userMessage` yet at onStart (BaseClient adds
              // them later), so attach them from the request — this is the message
              // `trackUserMessage` persists as the authoritative job.metadata.userMessage,
              // and it's what the live client renders the user bubble from.
              message: {
                ...userMessage,
                // Carry files so trackUserMessage (the authoritative writer) persists them on
                // job.metadata.userMessage for a HITL resume (see the updateMetadata above).
                ...(Array.isArray(req.body?.files) &&
                  req.body.files.length > 0 && { files: req.body.files }),
                ...(Array.isArray(req.body?.manualSkills) &&
                  req.body.manualSkills.length > 0 && { manualSkills: req.body.manualSkills }),
                ...(Array.isArray(req.body?.alwaysAppliedSkills) &&
                  req.body.alwaysAppliedSkills.length > 0 && {
                    alwaysAppliedSkills: req.body.alwaysAppliedSkills,
                  }),
              },
              streamId,
            },
            { expectedCreatedAt: jobCreatedAt },
          ).catch((err) => {
            logger.error('[ResumableAgentController] Failed to queue created event', err);
          });
        };

        const messageOptions = {
          user: userId,
          onStart,
          getReqData,
          isContinued,
          isRegenerate,
          editedContent,
          conversationId,
          parentMessageId,
          abortController: job.abortController,
          overrideParentMessageId,
          isEdited: !!editedContent,
          beforeResponsePersistence: claimBeforeResponsePersistence,
          userMCPAuthMap: result.userMCPAuthMap,
          responseMessageId: editedResponseMessageId,
          progressOptions: {
            res: {
              write: () => true,
              end: () => {},
              headersSent: false,
              writableEnded: false,
            },
          },
        };

        const sendPromise = client.sendMessage(text, messageOptions);

        if (titleEligible && titleTiming === 'immediate') {
          immediateTitlePromise = addTitle(req, {
            text,
            conversationId,
            client,
            immediate: true,
            convoReady,
            signal: titleAbortController.signal,
            discardSignal: titleDiscardController.signal,
            onTitleGenerated: emitTitleEvent,
          }).catch((err) => {
            logger.error('[ResumableAgentController] Error in immediate title generation', err);
          });
        }

        const response = await sendPromise;

        // HITL: the turn paused for human review (see AgentClient.handleRunInterrupt).
        // The job is already `requires_action` with the pending action persisted and
        // emitted to the client; the resume route owns finishing this turn. Settle and
        // verify the required unfinished history, then tear down without publishing a
        // terminal event or completing a successfully persisted paused job.
        if (client?.pendingApproval) {
          if (response?.databasePromise) {
            try {
              await response.databasePromise;
            } catch (dbErr) {
              logger.error(
                '[ResumableAgentController] Error settling databasePromise on HITL pause',
                dbErr,
              );
            }
            delete response.databasePromise;
          }
          const pauseActionId = client.pendingApproval.actionId;
          const pauseCreatedAt = client.jobCreatedAt ?? jobCreatedAt;
          const ownsPausePersistence = await GenerationJobManager.approvals.ownsPausePersistence(
            streamId,
            pauseActionId,
            pauseCreatedAt,
          );
          if (ownsPausePersistence) {
            try {
              /** BaseClient awaits its first user/conversation write before the
               * pause hook, but deliberately swallows a failed/falsy user save
               * and may still record the id locally. Re-save idempotently for
               * every ordinary user turn before exposing the approval. */
              if (!client?.skipSaveUserMessage) {
                if (!userMessage) {
                  throw new Error('User message was unavailable before HITL pause');
                }
                if (
                  typeof client.saveMessageToDatabase === 'function' &&
                  typeof client.getSaveOptions === 'function'
                ) {
                  /** Retry through BaseClient so a failure before its original
                   * saveConvo is repaired along with the message row. Direct
                   * saveMessage alone cannot recreate that conversation. */
                  const savedUserTurn = await client.saveMessageToDatabase(
                    userMessage,
                    client.getSaveOptions(),
                    userId,
                  );
                  if (!savedUserTurn?.message) {
                    throw new Error('User message could not be persisted before HITL pause');
                  }
                  if (!client.skipSaveConvo && !savedUserTurn.conversation) {
                    throw new Error('Conversation could not be persisted before HITL pause');
                  }
                } else {
                  // Custom clients used by integrations/tests may not inherit BaseClient.
                  const savedUserMessage = await saveMessage(
                    {
                      userId,
                      isTemporary: req?.body?.isTemporary,
                      interfaceConfig: req?.config?.interfaceConfig,
                    },
                    userMessage,
                    {
                      context:
                        'api/server/controllers/agents/request.js - user message before HITL pause',
                    },
                  );
                  if (!savedUserMessage) {
                    throw new Error('User message could not be persisted before HITL pause');
                  }
                }
              }
              if (!response?.messageId) {
                throw new Error('Response message was unavailable before HITL pause');
              }
              const savedResponseMessage = await saveMessage(
                {
                  userId,
                  isTemporary: req?.body?.isTemporary,
                  interfaceConfig: req?.config?.interfaceConfig,
                },
                {
                  ...response,
                  endpoint: endpointOption.endpoint,
                  unfinished: true,
                  user: userId,
                },
                {
                  context:
                    'api/server/controllers/agents/request.js - HITL pause (persist unfinished)',
                },
              );
              if (!savedResponseMessage) {
                throw new Error('Paused response could not be persisted as unfinished');
              }
              await commitRecoveredSteer();
            } catch (pausePersistenceError) {
              pausePersistenceFailed = true;
              let failed;
              try {
                failed = await GenerationJobManager.failPausePersistence(
                  streamId,
                  pauseActionId,
                  pausePersistenceError?.message ?? 'Pause persistence failed',
                  pauseCreatedAt,
                );
              } catch (failError) {
                logger.error(
                  `[ResumableAgentController] Failed to terminalize pause persistence error for ${streamId}`,
                  failError,
                );
              }
              if (failed === true) {
                /** Namespaced checkpoints belong exclusively to this epoch,
                 * so the exact pause-failure CAS winner can safely remove the
                 * now-unresumable graph state. Legacy shared namespaces are
                 * left to their guarded/TTL cleanup path. */
                const checkpointNamespace = job.metadata?.checkpointNamespace;
                if (typeof checkpointNamespace === 'string' && checkpointNamespace !== '') {
                  try {
                    await deleteAgentCheckpoint(
                      conversationId,
                      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
                      undefined,
                      { checkpointNamespace },
                    );
                  } catch (checkpointError) {
                    logger.error(
                      `[ResumableAgentController] Failed to prune checkpoint after pause persistence error for ${streamId}`,
                      checkpointError,
                    );
                  }
                }
              } else if (failed === false) {
                logger.warn(
                  `[ResumableAgentController] Skipping stale pause persistence failure — ${streamId} no longer owns its barrier`,
                );
              }
              throw pausePersistenceError;
            }
            const released = await GenerationJobManager.approvals.finishPausePersistence(
              streamId,
              pauseActionId,
              pauseCreatedAt,
            );
            if (!released) {
              logger.warn(
                `[ResumableAgentController] Pause persistence barrier changed before release: ${streamId}`,
              );
            }
          } else {
            logger.debug(
              `[ResumableAgentController] Skipping stale pause persistence — ${streamId} no longer owns its barrier`,
            );
          }
          titleAbortController.abort();
          acceptsTitleEvents = false;
          resolveConvoReady();
          // handleRunInterrupt already released the concurrency slot the moment it paused
          // (so a fast /resume isn't 429'd); only release here if that didn't happen.
          // Always run the MCP request-context cleanup.
          await cleanupMCPRequestContextForReq(req);
          if (!client?.pendingRequestReleased) {
            await decrementPendingRequest(userId);
          }
          if (client) {
            disposeClient(client);
          }
          logger.debug(
            `[ResumableAgentController] Turn paused for approval; awaiting resume: ${streamId}`,
          );
          startupTelemetry?.end('paused');
          return;
        }

        // BaseClient invokes this before starting its response write. Custom
        // clients/tests may return a database promise directly, so keep the
        // controller-side fallback before awaiting that promise.
        await claimBeforeResponsePersistence();

        const endpoint = endpointOption.endpoint;
        response.endpoint = endpoint;

        const databasePromise = response.databasePromise;
        delete response.databasePromise;

        const { conversation: convoData = {} } = await databasePromise;
        const conversation = { ...convoData };
        conversation.title =
          conversation && !conversation.title ? null : conversation?.title || 'New Chat';

        if (!terminalClaim) {
          /** Stop/replacement won before the response persistence hook. The
           * BaseClient contract skipped its completed response write; cancel
           * title work and leave terminal publication/persistence to the
           * actual winner. */
          titleAbortController.abort();
          titleDiscardController.abort();
          job.abortController.signal.removeEventListener('abort', abortTitleOnJobAbort);
          acceptsTitleEvents = false;
          resolveConvoReady();
          await finishResumableRequest(req, userId);
          disposeBackgroundClient();
          startupTelemetry?.end(job.abortController.signal.aborted ? 'aborted' : 'replaced');
          return;
        }

        if (req.body.files && Array.isArray(client.options.attachments)) {
          const files = buildMessageFiles(req.body.files, client.options.attachments);
          if (files.length > 0) {
            userMessage.files = files;
          }
          delete userMessage.image_urls;
        }

        const shouldGenerateTitle =
          addTitle &&
          parentMessageId === Constants.NO_PARENT &&
          isNewConvo &&
          !terminalWasAborted &&
          !preemptIncomplete;

        // Save user message BEFORE sending final event to avoid race condition
        // where client refetch happens before database is updated
        const reqCtx = {
          userId: req?.user?.id,
          isTemporary: req?.body?.isTemporary,
          interfaceConfig: req?.config?.interfaceConfig,
        };

        if (!client.skipSaveUserMessage) {
          if (!userMessage) {
            throw new Error('User message was unavailable before terminal persistence');
          }
          const savedUserMessage = await saveMessage(reqCtx, userMessage, {
            context: 'api/server/controllers/agents/request.js - resumable user message',
          });
          if (!savedUserMessage) {
            throw new Error('User message could not be persisted before terminal publication');
          }
        }
        // Only consume the parked recovery source after the explicit user-row
        // write above succeeds. `response.databasePromise` alone is insufficient:
        // BaseClient intentionally swallows a failed first user-message save.
        await commitRecoveredSteer();

        // CRITICAL: Save response message BEFORE emitting final event.
        // This prevents race conditions where the client sends a follow-up message
        // before the response is saved to the database, causing orphaned parentMessageIds.
        /** BaseClient can add the id to savedMessageIds even when its model-layer
         * save resolved falsy. Re-save the terminal row idempotently and require
         * the returned durable row before publishing the normal FINAL. */
        const responseIsUnfinished = terminalWasAborted || preemptIncomplete;
        const savedResponseMessage = await saveMessage(
          reqCtx,
          {
            ...response,
            user: userId,
            unfinished: responseIsUnfinished,
          },
          {
            context: responseIsUnfinished
              ? 'api/server/controllers/agents/request.js - terminal response unfinished'
              : 'api/server/controllers/agents/request.js - resumable response end',
          },
        );
        if (!savedResponseMessage) {
          throw new Error(
            responseIsUnfinished
              ? 'Terminal response could not be persisted as unfinished'
              : 'Response message could not be persisted before terminal publication',
          );
        }

        // If the user stopped this turn — or an empty preempt boundary truncated
        // it, which persists under the same honest `unfinished` contract — cancel
        // the title BEFORE unblocking its persistence wait; otherwise resolving
        // `convoReady` lets the title task resume and save before the later abort runs.
        if (terminalWasAborted || preemptIncomplete) {
          titleAbortController.abort();
        } else {
          job.abortController.signal.removeEventListener('abort', abortTitleOnJobAbort);
        }

        // The conversation row now exists and this stream is authoritative; allow
        // any in-flight immediate title generation to persist (saveConvo uses noUpsert).
        resolveConvoReady();
        acceptsTitleEvents = false;

        if (titleEventPromise) {
          await titleEventPromise;
        }

        let terminalPublicationStarted = false;
        try {
          const pendingSteers = terminalClaim.drainedSteers.map(toPendingSteer);
          const finalEvent = {
            final: true,
            conversation,
            title: conversation.title,
            requestMessage: sanitizeMessageForTransmit(userMessage),
            responseMessage: {
              ...response,
              ...((terminalWasAborted || preemptIncomplete) && { unfinished: true }),
            },
            ...(pendingSteers.length > 0 && { pendingSteers }),
          };

          logger.debug(
            terminalWasAborted
              ? `[ResumableAgentController] Emitting ABORTED FINAL event`
              : `[ResumableAgentController] Emitting FINAL event`,
            {
              streamId,
              wasAbortedBeforeComplete: terminalWasAborted,
              userMessageId: userMessage?.messageId,
              responseMessageId: response?.messageId,
              conversationId: conversation?.conversationId,
            },
          );

          terminalPublicationStarted = true;
          const publication = await GenerationJobManager.publishTerminalClaim(
            terminalClaim,
            finalEvent,
          );
          let terminalOutcome = 'completed_without_delta';
          if (publication.persistenceFailed) {
            terminalOutcome = 'error';
          } else if (terminalWasAborted) {
            terminalOutcome = 'aborted';
          }
          startupTelemetry?.end(terminalOutcome);
        } catch (terminalError) {
          /** A failure while constructing the payload happened after this
           * controller's terminal CAS but before the manager could durably
           * settle it. Publish conservative reconciliation immediately. Once
           * publication starts, the manager either stores the payload or owns
           * its bounded recovery marker, so retrying with a different payload
           * here would only risk duplicate delivery. */
          if (!terminalPublicationStarted) {
            try {
              await GenerationJobManager.publishTerminalClaim(terminalClaim, null);
            } catch (reconcileError) {
              logger.warn(
                '[ResumableAgentController] Failed to publish terminal persistence reconciliation',
                reconcileError,
              );
            }
          }
          throw terminalError;
        } finally {
          // Pair every successful claim even when final-event construction or
          // transport publication throws. Cleanup is epoch/runtime guarded.
          await finishOwnedTerminalClaim();
        }
        await finishResumableRequest(req, userId);

        if (titleTiming === 'immediate') {
          // Title was fired in parallel above (if eligible); a stopped turn already
          // aborted it before `resolveConvoReady`. Defer disposal until it settles
          // so the run/req aren't torn down mid-generation.
          if (immediateTitlePromise) {
            immediateTitlePromise.finally(() => {
              if (client) {
                disposeClient(client);
              }
            });
          } else if (client) {
            disposeClient(client);
          }
        } else if (shouldGenerateTitle) {
          addTitle(req, {
            text,
            response: { ...response },
            client,
          })
            .catch((err) => {
              logger.error('[ResumableAgentController] Error in title generation', err);
            })
            .finally(() => {
              if (client) {
                disposeClient(client);
              }
            });
        } else {
          if (client) {
            disposeClient(client);
          }
        }
      } catch (error) {
        // Any failure (user Stop, or a preflight/quota failure before the run is
        // even created) must cancel the title and unblock its waits: the title's
        // `_waitForRun` would otherwise never resolve, deferring client disposal
        // until the 45s title timeout, and no title should persist for a failed turn.
        titleAbortController.abort();
        titleDiscardController.abort();
        job.abortController.signal.removeEventListener('abort', abortTitleOnJobAbort);
        acceptsTitleEvents = false;
        resolveConvoReady();

        // Once this controller owns terminal persistence, no competing error
        // transition can win. Settle its pending marker with conservative
        // reconciliation on any required-write/final-construction failure,
        // then release exactly that claim.
        if (terminalClaim && !terminalClaimFinished) {
          try {
            await GenerationJobManager.publishTerminalClaim(terminalClaim, null);
          } catch (publishError) {
            logger.warn(
              '[ResumableAgentController] Failed to publish terminal persistence reconciliation',
              publishError,
            );
          } finally {
            await finishOwnedTerminalClaim().catch((finishError) => {
              logger.warn(
                '[ResumableAgentController] Failed to finish terminal persistence claim',
                finishError,
              );
            });
          }
          logger.error(
            `[ResumableAgentController] Terminal persistence failed for ${streamId}:`,
            error,
          );
          startupTelemetry?.end('error', error);
        } else if (pausePersistenceFailed) {
          // failPausePersistence owns the only legal requires_action -> error
          // transition for this exact action/epoch. Never fall through to
          // completeJob, which could race a newer action or replacement job.
          logger.error(
            `[ResumableAgentController] Pause persistence failed for ${streamId}:`,
            error,
          );
          startupTelemetry?.end('error', error);
        } else if (job.abortController.signal.aborted || error.message?.includes('abort')) {
          logger.debug(`[ResumableAgentController] Generation aborted for ${streamId}`);
          startupTelemetry?.end('aborted');
          // abortJob already handled emitDone and completeJob
        } else {
          logger.error(`[ResumableAgentController] Generation error for ${streamId}:`, error);
          const generationError = error.message || 'Generation failed';
          try {
            // completeJob first wins running -> error and atomically parks
            // steers, then publishes. A competing abort/pause emits nothing.
            await GenerationJobManager.completeJob(streamId, generationError, jobCreatedAt);
          } catch (completeErr) {
            logger.warn(
              '[ResumableAgentController] completeJob failed during generation-error cleanup',
              completeErr,
            );
          } finally {
            startupTelemetry?.end('error', error);
          }
        }

        try {
          await finishResumableRequest(req, userId);
        } finally {
          disposeBackgroundClient();
        }

        // Don't continue to title generation after error/abort
        return;
      }
    };

    // Start generation and handle any unhandled errors
    startGeneration().catch(async (err) => {
      logger.error(
        `[ResumableAgentController] Unhandled error in background generation: ${err.message}`,
      );
      startupTelemetry?.end('error', err);
      if (!pausePersistenceFailed) {
        await GenerationJobManager.completeJob(streamId, err.message, jobCreatedAt).catch(
          (completeErr) => {
            logger.warn(
              '[ResumableAgentController] completeJob failed during background-error cleanup',
              completeErr,
            );
          },
        );
      }
      try {
        await finishResumableRequest(req, userId);
      } finally {
        disposeBackgroundClient();
      }
    });
  } catch (error) {
    logger.error('[ResumableAgentController] Initialization error:', error);
    try {
      if (!res.headersSent) {
        if (error?.code === 'GENERATION_PREDECESSOR_MISMATCH') {
          const currentJob = error.currentJob;
          const currentStatus = currentJob?.status;
          const predecessorVerified =
            currentJob != null &&
            Number.isSafeInteger(currentJob.createdAt) &&
            currentJob.createdAt >= 0 &&
            currentJob.verified !== false;
          sendGenerationJson(
            res,
            409,
            {
              status: 'predecessor_mismatch',
              code: 'GENERATION_PREDECESSOR_MISMATCH',
              error: predecessorVerified
                ? 'A newer generation became current before this request could start.'
                : 'The prior generation could not be verified. Please retry.',
              streamId,
              conversationId: currentJob?.conversationId ?? conversationId,
              generationCreatedAt: currentJob?.createdAt,
              predecessorVerified,
              active:
                typeof currentJob?.active === 'boolean'
                  ? currentJob.active
                  : currentStatus === 'running' || currentStatus === 'requires_action',
            },
            generationProtocolVersion,
          );
        } else if (error?.code === 'RECOVERY_PAYLOAD_MISMATCH') {
          sendGenerationJson(
            res,
            409,
            {
              code: 'RECOVERY_PAYLOAD_MISMATCH',
              error: 'The queued message changed before it could be recovered. Please retry.',
            },
            generationProtocolVersion,
          );
        } else {
          sendGenerationJson(
            res,
            500,
            { error: error.message || 'Failed to start generation' },
            generationProtocolVersion,
          );
        }
      }
    } catch (notificationError) {
      logger.warn(
        '[ResumableAgentController] Failed to send initialization error response',
        notificationError,
      );
    } finally {
      startupTelemetry?.end(
        error?.code === 'GENERATION_PREDECESSOR_MISMATCH' ? 'deduplicated' : 'error',
        error,
      );
    }
    // Finalize THIS failed job before releasing the idempotency claim. Releasing first would
    // let the client's retry win the same key and createJob() the same streamId while we are
    // still here. The generation guard is defense-in-depth around that ordering. A
    // completeJob() rejection (store hiccup) must NOT skip the
    // release + pending-request decrement below, or the retry stays wedged behind the claim
    // and the concurrency slot leaks — so swallow its error. (A failed completeJob did not
    // finalize anything, so releasing afterward can't let it abort a later replacement.)
    if (jobCreatedAt != null) {
      const initializationError = error.message || 'Failed to start generation';
      await GenerationJobManager.completeJob(streamId, initializationError, jobCreatedAt).catch(
        (completeErr) => {
          logger.warn(
            '[ResumableAgentController] completeJob failed during init-error cleanup',
            completeErr,
          );
        },
      );
    }
    if (ownedIdempotencyClaim) {
      await GenerationJobManager.releaseGeneration(
        userId,
        clientRequestId,
        streamId,
        ownedIdempotencyClaim,
      ).catch(() => {});
    }
    await finishResumableRequest(req, userId);
    if (client) {
      disposeClient(client);
    }
  }
};

/**
 * Agent Controller - Routes to ResumableAgentController for all requests.
 * The legacy non-resumable path is kept below but no longer used by default.
 */
const AgentController = async (req, res, next, initializeClient, addTitle) => {
  return ResumableAgentController(req, res, next, initializeClient, addTitle);
};

/**
 * Legacy Non-resumable Agent Controller - Uses GenerationJobManager for abort handling.
 * Response is streamed directly to client via res, but abort state is managed centrally.
 * @deprecated Use ResumableAgentController instead
 */
const _LegacyAgentController = async (req, res, next, initializeClient, addTitle) => {
  const {
    text,
    isRegenerate,
    endpointOption,
    conversationId: reqConversationId,
    isContinued = false,
    editedContent = null,
    parentMessageId = null,
    overrideParentMessageId = null,
    responseMessageId: editedResponseMessageId = null,
  } = req.body;

  // Generate conversationId upfront if not provided - streamId === conversationId always
  // Treat "new" as a placeholder that needs a real UUID (frontend may send "new" for new convos)
  const isNewConvo = !reqConversationId || reqConversationId === 'new';
  const conversationId = isNewConvo ? crypto.randomUUID() : reqConversationId;
  const streamId = conversationId;

  let userMessage;
  let userMessageId;
  let responseMessageId;
  let client = null;
  let jobCreatedAt;
  let cleanupHandlers = [];

  // Match the same logic used for conversationId generation above
  const userId = req.user.id;

  if (
    await isUnpersistedPreliminaryParent({
      userId,
      conversationId: reqConversationId,
      parentMessageId,
      getMessages,
    })
  ) {
    return rejectPreliminaryParentMessageId(res);
  }

  await attachConversationCreatedAt(req, { userId, conversationId, isNewConvo });

  // Create handler to avoid capturing the entire parent scope
  let getReqData = (data = {}) => {
    for (let key in data) {
      if (key === 'userMessage') {
        userMessage = data[key];
        userMessageId = data[key].messageId;
      } else if (key === 'responseMessageId') {
        responseMessageId = data[key];
      } else if (key === 'promptTokens') {
        // Update job metadata with prompt tokens for abort handling
        GenerationJobManager.updateMetadata(streamId, { promptTokens: data[key] }, jobCreatedAt);
      } else if (key === 'sender') {
        GenerationJobManager.updateMetadata(streamId, { sender: data[key] }, jobCreatedAt);
      }
      // conversationId is pre-generated, no need to update from callback
    }
  };

  // Create a function to handle final cleanup
  const performCleanup = async () => {
    logger.debug('[AgentController] Performing cleanup');
    if (Array.isArray(cleanupHandlers)) {
      for (const handler of cleanupHandlers) {
        try {
          if (typeof handler === 'function') {
            handler();
          }
        } catch (e) {
          logger.error('[AgentController] Error in cleanup handler', e);
        }
      }
    }

    // Complete the job in GenerationJobManager
    if (jobCreatedAt != null) {
      logger.debug('[AgentController] Completing job in GenerationJobManager');
      await GenerationJobManager.completeJob(streamId, undefined, jobCreatedAt);
    }

    // Dispose client properly
    if (client) {
      disposeClient(client);
    }

    // Clear all references
    client = null;
    getReqData = null;
    userMessage = null;
    cleanupHandlers = null;

    // Clear request data map
    if (requestDataMap.has(req)) {
      requestDataMap.delete(req);
    }
    logger.debug('[AgentController] Cleanup completed');
  };

  try {
    let prelimAbortController = new AbortController();
    const prelimCloseHandler = createCloseHandler(prelimAbortController);
    res.on('close', prelimCloseHandler);
    const removePrelimHandler = (manual) => {
      try {
        prelimCloseHandler(manual);
        res.removeListener('close', prelimCloseHandler);
      } catch (e) {
        logger.error('[AgentController] Error removing close listener', e);
      }
    };
    cleanupHandlers.push(removePrelimHandler);

    /** @type {{ client: TAgentClient; userMCPAuthMap?: Record<string, Record<string, string>> }} */
    const result = await initializeClient({
      req,
      res,
      endpointOption,
      signal: prelimAbortController.signal,
    });

    if (prelimAbortController.signal?.aborted) {
      prelimAbortController = null;
      throw new Error('Request was aborted before initialization could complete');
    } else {
      prelimAbortController = null;
      removePrelimHandler(true);
      cleanupHandlers.pop();
    }
    client = result.client;

    // Register client with finalization registry if available
    if (clientRegistry) {
      clientRegistry.register(client, { userId }, client);
    }

    // Store request data in WeakMap keyed by req object
    requestDataMap.set(req, { client });

    // Create job in GenerationJobManager for abort handling
    // streamId === conversationId (pre-generated above)
    const job = await GenerationJobManager.createJob(streamId, userId, conversationId);
    jobCreatedAt = job.createdAt;
    client.jobCreatedAt = jobCreatedAt;
    client.checkpointNamespace = job.metadata?.checkpointNamespace ?? '';

    // Store endpoint metadata for abort handling
    GenerationJobManager.updateMetadata(
      streamId,
      {
        endpoint: endpointOption.endpoint,
        iconURL: getEndpointIconURL(req, endpointOption),
        model: getAgentResponseModel(req, endpointOption),
        sender: client?.sender,
      },
      jobCreatedAt,
    );

    // Store content parts reference for abort
    if (client?.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts, jobCreatedAt);
    }

    const closeHandler = createCloseHandler(job.abortController);
    res.on('close', closeHandler);
    cleanupHandlers.push(() => {
      try {
        res.removeListener('close', closeHandler);
      } catch (e) {
        logger.error('[AgentController] Error removing close listener', e);
      }
    });

    /**
     * onStart callback - stores user message and response ID for abort handling
     */
    const onStart = (userMsg, respMsgId, _isNewConvo) => {
      sendEvent(res, { message: userMsg, created: true });
      userMessage = userMsg;
      userMessageId = userMsg.messageId;
      responseMessageId = respMsgId;

      // Store metadata for abort handling (conversationId is pre-generated)
      GenerationJobManager.updateMetadata(
        streamId,
        {
          responseMessageId: respMsgId,
          userMessage: {
            messageId: userMsg.messageId,
            parentMessageId: userMsg.parentMessageId,
            conversationId,
            text: userMsg.text,
            quotes: userMsg.quotes,
          },
        },
        jobCreatedAt,
      );
    };

    const messageOptions = {
      user: userId,
      onStart,
      getReqData,
      isContinued,
      isRegenerate,
      editedContent,
      conversationId,
      parentMessageId,
      abortController: job.abortController,
      overrideParentMessageId,
      isEdited: !!editedContent,
      userMCPAuthMap: result.userMCPAuthMap,
      responseMessageId: editedResponseMessageId,
      progressOptions: {
        res,
      },
    };

    let response = await client.sendMessage(text, messageOptions);

    // Extract what we need and immediately break reference
    const messageId = response.messageId;
    const endpoint = endpointOption.endpoint;
    response.endpoint = endpoint;

    // Store database promise locally
    const databasePromise = response.databasePromise;
    delete response.databasePromise;

    // Resolve database-related data
    const { conversation: convoData = {} } = await databasePromise;
    const conversation = { ...convoData };
    conversation.title =
      conversation && !conversation.title ? null : conversation?.title || 'New Chat';

    if (req.body.files && Array.isArray(client.options.attachments)) {
      const files = buildMessageFiles(req.body.files, client.options.attachments);
      if (files.length > 0) {
        userMessage.files = files;
      }
      delete userMessage.image_urls;
    }

    // Only send if not aborted
    if (!job.abortController.signal.aborted) {
      // Create a new response object with minimal copies
      const finalResponse = { ...response };

      sendEvent(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: sanitizeMessageForTransmit(userMessage),
        responseMessage: finalResponse,
      });
      res.end();

      // Save the message if needed
      if (client.savedMessageIds && !client.savedMessageIds.has(messageId)) {
        await saveMessage(
          {
            userId: req?.user?.id,
            isTemporary: req?.body?.isTemporary,
            interfaceConfig: req?.config?.interfaceConfig,
          },
          { ...finalResponse, user: userId },
          { context: 'api/server/controllers/agents/request.js - response end' },
        );
      }
    }
    // Edge case: sendMessage completed but abort happened during sendCompletion
    // We need to ensure a final event is sent
    else if (!res.headersSent && !res.finished) {
      logger.debug(
        '[AgentController] Handling edge case: `sendMessage` completed but aborted during `sendCompletion`',
      );

      const finalResponse = { ...response };
      finalResponse.error = true;

      sendEvent(res, {
        final: true,
        conversation,
        title: conversation.title,
        requestMessage: sanitizeMessageForTransmit(userMessage),
        responseMessage: finalResponse,
        error: { message: 'Request was aborted during completion' },
      });
      res.end();
    }

    // Save user message if needed
    if (!client.skipSaveUserMessage) {
      await saveMessage(
        {
          userId: req?.user?.id,
          isTemporary: req?.body?.isTemporary,
          interfaceConfig: req?.config?.interfaceConfig,
        },
        userMessage,
        { context: "api/server/controllers/agents/request.js - don't skip saving user message" },
      );
    }

    // Add title if needed - extract minimal data
    if (addTitle && parentMessageId === Constants.NO_PARENT && isNewConvo) {
      addTitle(req, {
        text,
        response: { ...response },
        client,
      })
        .then(() => {
          logger.debug('[AgentController] Title generation started');
        })
        .catch((err) => {
          logger.error('[AgentController] Error in title generation', err);
        })
        .finally(() => {
          logger.debug('[AgentController] Title generation completed');
          performCleanup();
        });
    } else {
      performCleanup();
    }
  } catch (error) {
    // Handle error without capturing much scope
    handleAbortError(res, req, error, {
      conversationId,
      sender: client?.sender,
      messageId: responseMessageId,
      parentMessageId: overrideParentMessageId ?? userMessageId ?? parentMessageId,
      userMessageId,
    })
      .catch((err) => {
        logger.error('[api/server/controllers/agents/request] Error in `handleAbortError`', err);
      })
      .finally(() => {
        performCleanup();
      });
  }
};

module.exports = AgentController;
