const { logger } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const {
  GenerationJobManager,
  isPendingActionStale,
  mapToolApprovalResolutions,
  resolveAskUserQuestionResume,
  buildResolvedAskUserQuestion,
  appendResolvedAskUserQuestion,
  attachAskUserQuestionAnswers,
  findAskUserQuestionContentIndex,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  findIncompleteDecisions,
  computeAgentRequestFingerprint,
  captureAgentCheckpointGeneration,
  deleteAgentCheckpoint,
  buildAbortedResponseMetadata,
  sanitizeMessageForTransmit,
  filterMalformedContentParts,
  decrementPendingRequest,
  checkAndIncrementPendingRequest,
  isSteerPreemptSupported,
  toPendingSteer,
} = require('@librechat/api');
const { disposeClient } = require('~/server/cleanup');
const {
  getMCPRequestContext,
  cleanupMCPRequestContextForReq,
} = require('~/server/services/MCPRequestContext');
const { saveMessage, getConvo, getMessages } = require('~/models');
const {
  GENERATION_PROTOCOL_HEADER,
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

/**
 * How long a resume waits on best-effort steering bookkeeping before answering
 * anyway. The approval is already consumed by that point, so a stalled Redis
 * must not strand the client behind a chip label and an arm.
 */
const STEER_RESUME_SETUP_TIMEOUT_MS = 1000;

/**
 * New jobs are physically isolated by an immutable saver namespace, so a
 * terminal owner deletes the whole namespace and catches writes that landed
 * after an earlier read. Pre-isolation jobs share the root namespace and must
 * retain captured-id cleanup to avoid pruning a replacement.
 */
function deleteResumedGenerationCheckpoint({
  conversationId,
  checkpointerCfg,
  job,
  checkpointGeneration,
}) {
  const checkpointNamespace =
    typeof job?.metadata?.checkpointNamespace === 'string' ? job.metadata.checkpointNamespace : '';
  if (checkpointNamespace !== '') {
    return deleteAgentCheckpoint(conversationId, checkpointerCfg, undefined, {
      checkpointNamespace,
    });
  }
  return deleteAgentCheckpoint(conversationId, checkpointerCfg, checkpointGeneration);
}

/** Error-path checkpoint cleanup runs after the HTTP ACK. A storage failure
 * must be observable, but must not escape the controller catch and bypass the
 * remaining request-context/concurrency/client cleanup in `finally`. */
async function deleteFailedResumeCheckpoint(args, context) {
  try {
    await deleteResumedGenerationCheckpoint(args);
  } catch (error) {
    logger.error(`[ResumeAgentController] Failed to prune checkpoint after ${context}`, error);
  }
}

/** De-duplicate a merged attachment list by a stable artifact identity. */
function mergeAttachments(existing, incoming) {
  const seen = new Set();
  const out = [];
  for (const attachment of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!attachment) {
      continue;
    }
    const key =
      attachment.file_id ??
      attachment.filepath ??
      attachment.filename ??
      JSON.stringify(attachment);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(attachment);
  }
  return out;
}

/**
 * Resolve the current segment's tool artifacts and merge them with any already
 * persisted on the response row. A resumed turn can span multiple pause segments;
 * each rebuilt client has its own `artifactPromises`, and the final finalize would
 * otherwise OVERWRITE the row's attachments with only the last segment's. Reading
 * the persisted row and merging keeps every segment's artifacts on the saved message.
 */
async function resolveAccumulatedAttachments({ client, conversationId, responseMessageId }) {
  const promises = Array.isArray(client?.artifactPromises) ? client.artifactPromises : [];
  const resolved = promises.length > 0 ? (await Promise.all(promises)).filter(Boolean) : [];
  let existing = [];
  if (responseMessageId) {
    try {
      const [row] = await getMessages(
        { conversationId, messageId: responseMessageId },
        'attachments',
      );
      existing = Array.isArray(row?.attachments) ? row.attachments : [];
    } catch (err) {
      logger.warn(
        '[ResumeAgentController] Failed to read prior attachments for merge',
        err?.message ?? err,
      );
    }
  }
  return mergeAttachments(existing, resolved);
}

/** Resolve the segment's content for an unfinished save (mirrors finalize's source). */
async function resolveSegmentContent(client, streamId, expectedCreatedAt) {
  const liveContent = Array.isArray(client?.contentParts) ? client.contentParts : [];
  const rawContent =
    liveContent.length > 0
      ? liveContent
      : ((await GenerationJobManager.getResumeState(streamId, expectedCreatedAt))
          ?.aggregatedContent ?? []);
  return filterMalformedContentParts(rawContent);
}

/**
 * A resumed segment that streamed content / produced artifacts and then paused AGAIN
 * must persist that progress before returning. The next resume rebuilds a fresh client
 * (empty `contentParts`/`artifactPromises`), so without this an approval that later
 * expires or is reaped would leave only the EARLIER pause's content on the saved row —
 * the user loses everything streamed during this segment. Saved as a partial (`$set`,
 * still `unfinished`) so a subsequent successful resume overwrites it on finalize.
 */
async function persistRePauseProgress({ req, client, job, streamId, conversationId }) {
  const userId = req.user.id;
  const meta = job.metadata ?? {};
  const responseMessageId = meta.responseMessageId ?? client.responseMessageId;
  if (!responseMessageId) {
    return;
  }
  const content = await resolveSegmentContent(client, streamId, job.createdAt);
  const attachments = await resolveAccumulatedAttachments({
    client,
    conversationId,
    responseMessageId,
  });
  if (content.length === 0 && attachments.length === 0) {
    return;
  }
  const savedResponseMessage = await saveMessage(
    {
      userId,
      isTemporary: meta.isTemporary ?? req.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    },
    {
      messageId: responseMessageId,
      conversationId,
      ...(content.length > 0 && { content }),
      ...(attachments.length > 0 && { attachments }),
      unfinished: true,
      user: userId,
    },
    { context: 'api/server/controllers/agents/resume.js - re-pause progress persist' },
  );
  if (!savedResponseMessage) {
    throw new Error('Re-pause response progress could not be persisted');
  }
}

/** Untenanted jobs (pre-multi-tenancy) remain accessible if the userId check passes. */
function hasTenantMismatch(job, user) {
  return job.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

/**
 * Build the SDK resume value from the wire decision payload, validating against the
 * pending action. Returns `{ resumeValue }` on success or `{ error }` with an HTTP
 * status for the route to surface.
 */
function resolveResumeValue(pendingAction, body) {
  const payload = pendingAction.payload;
  if (payload?.type === 'tool_approval') {
    const resolutions = Array.isArray(body.decisions) ? body.decisions : [];
    const undecided = findUndecidedToolCalls(payload, resolutions);
    if (undecided.length > 0) {
      return { status: 400, error: 'Every paused tool call must be decided', undecided };
    }
    // Enforce the policy's per-tool allowed_decisions — a crafted POST must not
    // approve a tool the policy restricted to (e.g.) reject/respond.
    const disallowed = findDisallowedDecisions(payload, resolutions);
    if (disallowed.length > 0) {
      return { status: 403, error: 'Decision not permitted for one or more tools', disallowed };
    }
    // `edit`/`respond` must carry their payload — otherwise toSdkDecision's defensive
    // defaults ({} / '') would resume with an empty input/result the user didn't approve.
    const incomplete = findIncompleteDecisions(resolutions);
    if (incomplete.length > 0) {
      return {
        status: 400,
        error: 'edit requires editedArguments and respond requires responseText',
        incomplete,
      };
    }
    return { resumeValue: mapToolApprovalResolutions(resolutions) };
  }
  if (payload?.type === 'ask_user_question') {
    return resolveAskUserQuestionResume(payload, body);
  }
  return { status: 400, error: 'Unsupported pending action type' };
}

/**
 * Finalize a resumed turn that ran to completion: persist the (now complete)
 * response message, emit the terminal event over the existing SSE, complete the
 * job, and prune the checkpoint. Mirrors the abort route's save shape but for a
 * successful finish. Best-effort title generation for a first-turn pause.
 */
async function finalizeResumedTurn({
  req,
  client,
  job,
  streamId,
  conversationId,
  addTitle,
  checkpointGeneration,
}) {
  const userId = req.user.id;
  const checkpointerCfg = req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer;
  const meta = job.metadata ?? {};
  const userMessage = meta.userMessage;
  // The response hangs off the user message; the *user* message's own parent decides
  // whether this is the first turn of the conversation (title eligibility).
  const parentMessageId = userMessage?.messageId ?? Constants.NO_PARENT;
  const isFirstTurn = (userMessage?.parentMessageId ?? Constants.NO_PARENT) === Constants.NO_PARENT;
  const responseMessageId = meta.responseMessageId ?? `${userMessage?.messageId ?? 'resumed'}_`;
  // Sourced from the paused job (persisted at creation), not the resume body — a
  // temporary chat must stay temporary on resume so its messages aren't persisted.
  const isTemporary = meta.isTemporary ?? req.body?.isTemporary;

  // Read the raw job data BEFORE completeJob deletes it — its tracked token/context
  // usage backs the response message's cost rollup (parity with normal completion).
  const jobData = await GenerationJobManager.getJobStore().getJob(streamId);

  // Job-replacement guard (mirrors the normal request path): jobs are keyed by streamId
  // (== conversationId), so a new/concurrent request reusing this conversation overwrites
  // the record with a fresh createdAt. If that happened while we were resuming, finalizing
  // now would emit `done` to / complete / delete the NEWER turn's job. Skip all terminal
  // side effects when the job we paused is no longer the live one; the caller's `finally`
  // still disposes the client + releases the slot.
  if (!jobData || jobData.createdAt !== job.createdAt) {
    logger.warn(
      `[ResumeAgentController] Skipping resumed finalization — job ${streamId} was replaced`,
    );
    return;
  }
  // Prefer the resumed run's live content: it's complete (seeded with the pre-pause
  // content) and avoids a Redis re-read that can race appendChunk writes still in
  // flight. Fall back to the aggregated store content only when the live array is empty.
  const liveContent = Array.isArray(client?.contentParts) ? client.contentParts : [];
  const rawContent =
    liveContent.length > 0
      ? liveContent
      : ((await GenerationJobManager.getResumeState(streamId, job.createdAt))?.aggregatedContent ??
        []);
  // Parity with the normal agents path (AgentClient strips these before saving):
  // drop empty/malformed tool_call parts so a resumed turn can't persist an invalid
  // part that breaks reload/rendering.
  const content = filterMalformedContentParts(rawContent);

  /**
   * A resumed segment can end on an empty preempt boundary just as a fresh
   * one can — the boundary hook is re-registered by `buildSteerWiring` on
   * resume. Persisting that as complete would contradict the honest contract
   * the normal request path now keeps.
   */
  const preemptStats = client?.run?.getPreemptStats?.();
  const preemptIncomplete =
    (preemptStats?.emptyBoundaries ?? 0) > 0 ||
    client?.run?.getHaltReason?.() === 'preempt_incomplete';

  const responseMessage = {
    messageId: responseMessageId,
    parentMessageId,
    conversationId,
    content,
    sender: meta.sender ?? client?.sender ?? 'AI',
    endpoint: meta.endpoint,
    iconURL: meta.iconURL,
    model: meta.model,
    unfinished: preemptIncomplete,
    error: false,
    isCreatedByUser: false,
    user: userId,
  };
  if (meta.agent_id ?? req.body?.agent_id) {
    responseMessage.agent_id = meta.agent_id ?? req.body.agent_id;
  }
  // Persist tool artifacts (code files, images, UI resources) the resumed continuation
  // produced — BaseClient.sendMessage awaits these before saving, but the lean resume
  // path bypasses it, so do it here or they vanish on reload / for late subscribers.
  // MERGE with any already on the row (earlier pause segments) rather than overwrite —
  // the final segment's client only holds its own segment's artifacts.
  const attachments = await resolveAccumulatedAttachments({
    client,
    conversationId,
    responseMessageId,
  });
  if (attachments.length > 0) {
    responseMessage.attachments = attachments;
  }

  // Response metadata: the resume client only sees POST-resume usage, while the job's
  // tracked tokenUsage is cumulative across the pause. Take the cumulative usage (+
  // summary marker) from the job, and contextUsage / thoughtSignatures from the client
  // (which the abort-only helper drops). Cumulative usage wins so cost isn't underreported.
  const clientMeta = client?.buildResponseMetadata?.() ?? null;
  const cumulativeMeta = jobData ? buildAbortedResponseMetadata(jobData) : null;
  const responseMetadata = {
    ...(clientMeta ?? {}),
    ...(cumulativeMeta?.usage ? { usage: cumulativeMeta.usage } : {}),
    ...(cumulativeMeta?.summaryUsedTokens != null
      ? { summaryUsedTokens: cumulativeMeta.summaryUsedTokens }
      : {}),
  };
  if (Object.keys(responseMetadata).length > 0) {
    responseMessage.metadata = responseMetadata;
  }
  // Carry the resumed run's context-window calibration (BaseClient.sendMessage persists
  // this on the response). Without it, the NEXT turn can't seed its pruner from this
  // run and falls back to uncalibrated token accounting.
  if (client?.contextMeta != null) {
    responseMessage.contextMeta = client.contextMeta;
  }

  // Win terminal ownership BEFORE the outcome-defining response write. Stop
  // and completion both write the same Mongo row; a later liveness read cannot
  // fence that external write, while this CAS gives exactly one side authority.
  // The durable pending marker keeps status/subscribers on the readiness path
  // until the winner has persisted and published its FINAL.
  const terminalClaim = await GenerationJobManager.claimTerminalJob(
    streamId,
    'complete',
    undefined,
    job.createdAt,
    { persistencePending: true },
  );
  if (!terminalClaim) {
    logger.warn(
      `[ResumeAgentController] Skipping resumed FINAL — another terminal/pause transition won for ${streamId}`,
    );
    return;
  }
  let terminalPublicationStarted = false;
  try {
    const savedResponseMessage = await saveMessage(
      { userId, isTemporary, interfaceConfig: req?.config?.interfaceConfig },
      responseMessage,
      { context: 'api/server/controllers/agents/resume.js - resumed response end' },
    );
    if (!savedResponseMessage) {
      throw new Error('Resumed response could not be persisted before terminal publication');
    }

    const convo = await getConvo(userId, conversationId);
    const conversation = { ...(convo ?? {}), conversationId };

    // First-turn pause: the title was deferred when the turn paused. Generate it BEFORE
    // completing the stream so the `title` event still reaches the live client (emitChunk
    // no-ops once completeJob tears down the runtime) and the final event carries the real
    // title instead of "New Chat". Best-effort — a failure must not fail the resumed turn.
    if (
      addTitle &&
      isFirstTurn &&
      !isTemporary &&
      userMessage?.text &&
      (!convo || !convo.title || convo.title === 'New Chat')
    ) {
      try {
        await addTitle(req, {
          text: userMessage.text,
          conversationId,
          client,
          onTitleGenerated: ({ conversationId: titleConvoId, title }) => {
            conversation.title = title;
            return GenerationJobManager.emitChunk(
              streamId,
              {
                event: 'title',
                data: { conversationId: titleConvoId, title },
              },
              { expectedCreatedAt: job.createdAt },
            );
          },
        });
      } catch (err) {
        logger.error('[ResumeAgentController] Title generation failed after resume', err);
      }
    }
    conversation.title = conversation.title || 'New Chat';

    const pendingSteers = terminalClaim.drainedSteers.map(toPendingSteer);
    const finalEvent = {
      final: true,
      conversation,
      title: conversation.title,
      requestMessage: userMessage
        ? sanitizeMessageForTransmit({
            ...userMessage,
            conversationId,
            isCreatedByUser: true,
            // job.metadata.userMessage is persisted without files; carry the restored
            // uploads (seeded onto req.body.files before reconstruction) so the final SSE
            // doesn't blank the user bubble's attachments — matching the normal path.
            ...(Array.isArray(req.body?.files) && req.body.files.length > 0
              ? { files: req.body.files }
              : {}),
          })
        : null,
      responseMessage: { ...responseMessage },
      ...(pendingSteers.length > 0 && { pendingSteers }),
    };

    terminalPublicationStarted = true;
    await GenerationJobManager.publishTerminalClaim(terminalClaim, finalEvent);
  } catch (error) {
    if (!terminalPublicationStarted) {
      try {
        await GenerationJobManager.publishTerminalClaim(terminalClaim, null);
      } catch (publishError) {
        logger.error(
          '[ResumeAgentController] Failed to publish terminal persistence reconciliation',
          publishError,
        );
      }
    }
    throw error;
  } finally {
    try {
      // Cleanup must run even if persistence/publication fails. The claim
      // carries the exact generation/runtime identity, so this cannot tear
      // down a later run.
      await GenerationJobManager.finishTerminalJob(terminalClaim);
    } finally {
      await deleteResumedGenerationCheckpoint({
        conversationId,
        checkpointerCfg,
        job,
        checkpointGeneration,
      });
    }
  }
}

/**
 * Resume a generation that paused for human-in-the-loop review.
 *
 * The original run lives in a detached background task that exits when the run
 * pauses, so this REBUILDS the run from the durable checkpoint (same `thread_id`)
 * and continues it with the user's decision. The continuation streams over the
 * client's existing SSE (events flow through the same `streamId`).
 *
 * Flow: authorize → map decisions → atomically claim the resume (single-winner) →
 * ACK → reconstruct the client → `resumeCompletion` → finalize (or re-pause).
 *
 * Shares chat.js's middleware (auth, agent access, `buildEndpointOption`) so the
 * agent/endpoint are reconstructed from the request exactly like a normal turn.
 *
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 * @param {Function} initializeClient
 * @param {Function} addTitle
 */
const ResumeAgentController = async (req, res, next, initializeClient, addTitle) => {
  const userId = req.user.id;
  let generationProtocolVersion = negotiateNewGenerationProtocol(req, GenerationJobManager);
  const { conversationId, actionId, generationCreatedAt } = req.body;
  const streamId = conversationId;

  if (!streamId || streamId === 'new') {
    return sendGenerationJson(
      res,
      400,
      { error: 'conversationId is required to resume' },
      generationProtocolVersion,
    );
  }
  if (
    generationCreatedAt != null &&
    (!Number.isSafeInteger(generationCreatedAt) || generationCreatedAt < 0)
  ) {
    return sendGenerationJson(
      res,
      400,
      { code: 'INVALID_GENERATION_IDENTITY' },
      generationProtocolVersion,
    );
  }

  const job = await GenerationJobManager.getJob(streamId);
  if (!job) {
    return sendGenerationJson(
      res,
      404,
      { error: 'No paused generation for this conversation' },
      generationProtocolVersion,
    );
  }
  // Every persisted generation is owner-scoped. A missing/corrupt owner is
  // not a legacy wildcard: fail closed before reading or resolving its action.
  if (job.metadata?.userId !== userId) {
    return sendGenerationJson(res, 403, { error: 'Unauthorized' }, generationProtocolVersion);
  }
  if (hasTenantMismatch(job, req.user)) {
    return sendGenerationJson(res, 403, { error: 'Unauthorized' }, generationProtocolVersion);
  }
  generationProtocolVersion = negotiateExistingGenerationProtocol(req, job);
  if (generationCreatedAt != null && job.createdAt !== generationCreatedAt) {
    return sendGenerationJson(res, 409, { code: 'RUN_REPLACED' }, generationProtocolVersion);
  }

  // The resume must rebuild the SAME agent/endpoint that paused. Require an EXACT
  // agent_id match when the paused job had one — a request that omits agent_id (or
  // claims an ephemeral / non-agents endpoint) must not rebuild the claimed checkpoint
  // on a different graph. The conversation's agent is stable, so a correct client always
  // sends the right one.
  const originalAgentId = job.metadata?.agent_id;
  if (originalAgentId && req.body.agent_id !== originalAgentId) {
    return sendGenerationJson(
      res,
      403,
      { error: 'Cannot resume with a different agent' },
      generationProtocolVersion,
    );
  }
  // Require an EXACT endpoint match (like agent_id): a request that OMITS endpoint must
  // not fall through — the shared chat middleware treats a missing/non-agents endpoint
  // as the ephemeral agent, so omitting it could rebuild the claimed checkpoint on a
  // different graph. A correct client always echoes the paused endpoint.
  const originalEndpoint = job.metadata?.endpoint;
  if (originalEndpoint && req.body.endpoint !== originalEndpoint) {
    return sendGenerationJson(
      res,
      403,
      { error: 'Cannot resume on a different endpoint' },
      generationProtocolVersion,
    );
  }

  const pendingAction = job.metadata?.pendingAction;
  if (job.status !== 'requires_action') {
    return sendGenerationJson(
      res,
      409,
      { error: 'No live pending action to resume' },
      generationProtocolVersion,
    );
  }
  if (isPendingActionStale({ pendingAction })) {
    // The action expired between the pending-action SSE and this submit. Drive the expiry
    // NOW (expire CAS + terminal SSE) instead of waiting for the periodic sweeper —
    // otherwise the job sits `requires_action` with a dead action and any attached SSE
    // client never gets a terminal event, so the stream appears to hang even though the
    // UI already reported the action as expired.
    try {
      await GenerationJobManager.expireApproval(streamId, pendingAction?.actionId, job.createdAt);
    } catch (err) {
      logger.warn(
        '[ResumeAgentController] Failed to expire stale action on submit',
        err?.message ?? err,
      );
    }
    return sendGenerationJson(
      res,
      409,
      { error: 'No live pending action to resume' },
      generationProtocolVersion,
    );
  }
  // Require the actionId the UI sends: without it, a stale/malformed client could
  // resolve whatever action is currently pending (e.g. answer a different question).
  if (!actionId) {
    return sendGenerationJson(
      res,
      400,
      { error: 'actionId is required to resume' },
      generationProtocolVersion,
    );
  }
  if (pendingAction.actionId !== actionId) {
    return sendGenerationJson(
      res,
      409,
      { error: 'This decision targets a stale action' },
      generationProtocolVersion,
    );
  }

  // Pin the graph identity: the resume must rebuild the SAME agent/graph + tool set the
  // run paused on. The agent_id + endpoint guards above cover saved agents; the
  // fingerprint additionally catches an ephemeral-agent config swap (its agent_id is
  // undefined, so the id guard can't tell two ephemeral configs apart). Enforced only
  // when the paused action carries a fingerprint (in-flight pauses from before this
  // change won't), and recomputed from the resume body's graph-determining fields.
  const pinnedFingerprint = pendingAction.requestFingerprint;
  if (pinnedFingerprint && pinnedFingerprint !== computeAgentRequestFingerprint(req.body ?? {})) {
    return sendGenerationJson(
      res,
      403,
      { error: 'Cannot resume with a different agent configuration' },
      generationProtocolVersion,
    );
  }

  const mapped = resolveResumeValue(pendingAction, req.body);
  if (mapped.error) {
    return sendGenerationJson(
      res,
      mapped.status,
      {
        error: mapped.error,
        ...(mapped.undecided && { undecided: mapped.undecided }),
        ...(mapped.disallowed && { disallowed: mapped.disallowed }),
        ...(mapped.incomplete && { incomplete: mapped.incomplete }),
      },
      generationProtocolVersion,
    );
  }
  let resolvedAskContentIndex;
  let resolvedAskContentMissing = false;
  if (pendingAction.payload.type === 'ask_user_question' && !pendingAction.payload.tool_call_id) {
    const answerSnapshot = await GenerationJobManager.getResumeState(streamId, job.createdAt);
    if (answerSnapshot == null) {
      return sendGenerationJson(res, 409, { code: 'RUN_REPLACED' }, generationProtocolVersion);
    }
    const askRequest = Array.isArray(pendingAction.payload.questions)
      ? { questions: pendingAction.payload.questions }
      : pendingAction.payload.question;
    const answerContent = answerSnapshot.aggregatedContent ?? [];
    if (answerContent.length > 0) {
      resolvedAskContentIndex = findAskUserQuestionContentIndex(
        answerContent,
        undefined,
        askRequest,
      );
      if (resolvedAskContentIndex < 0) {
        resolvedAskContentIndex = undefined;
        resolvedAskContentMissing = true;
      }
    } else {
      resolvedAskContentMissing = true;
    }
  }
  const resolvedAskUserQuestion = buildResolvedAskUserQuestion(
    pendingAction,
    req.body,
    resolvedAskContentIndex,
    resolvedAskContentMissing,
  );
  const resolvedAskUserQuestions = appendResolvedAskUserQuestion(
    job.metadata?.resolvedAskUserQuestions,
    resolvedAskUserQuestion,
  );

  // A legacy job has no saver-level generation namespace, so snapshot its exact
  // durable ids before the atomic resume claim. New jobs can skip this indexed
  // read: terminal cleanup deletes their whole immutable namespace, including
  // writes that land while the continuation is running.
  //
  // Start the indexed read alongside the independent concurrency check so the
  // generation guard adds minimal time to the resume ACK path.
  const checkpointerCfg = req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer;
  const checkpointNamespace =
    typeof job.metadata?.checkpointNamespace === 'string' ? job.metadata.checkpointNamespace : '';
  const checkpointGenerationPromise =
    checkpointNamespace !== ''
      ? Promise.resolve(undefined)
      : captureAgentCheckpointGeneration(conversationId, checkpointerCfg).catch((err) => {
          logger.warn('[ResumeAgentController] Failed to capture checkpoint generation', err);
          return {
            threadId: conversationId,
            checkpointIds: [],
          };
        });

  // Count the resume against the concurrency limit. The original turn released its slot
  // when it paused, so resuming must re-acquire one — otherwise pausing several turns
  // and resuming them at once would bypass LIMIT_CONCURRENT_MESSAGES.
  const { allowed } = await checkAndIncrementPendingRequest(userId);
  if (!allowed) {
    return sendGenerationJson(
      res,
      429,
      { error: 'Too many concurrent requests' },
      generationProtocolVersion,
    );
  }

  // Atomically claim the resume. The single winner drives the run; a racing second
  // submit (double-click, two tabs) gets false and must not re-drive — that would
  // re-execute tools and double-bill.
  //
  // The claim runs AFTER the slot increment above but BEFORE the run's own try/finally
  // that releases it, so a store/Redis error here (unlike the clean `!claimed` branch)
  // would leak the concurrency slot until the counter TTL expires — spuriously 429'ing
  // the user when they retry the still-paused approval. Release the slot on that path too.
  let claimed;
  let checkpointGeneration;
  try {
    checkpointGeneration = await checkpointGenerationPromise;
    /** The CAS that reopens steering must also publish THIS owner's seal
     *  capability. A separate write after status=`running` leaves a window in
     *  which steer/arm requests read the previous replica's capability. */
    claimed = await GenerationJobManager.approvals.resolve(
      streamId,
      pendingAction.actionId,
      {
        preemptCapable: isSteerPreemptSupported(),
        ...(resolvedAskUserQuestion && { resolvedAskUserQuestions }),
      },
      job.createdAt,
    );
  } catch (err) {
    await decrementPendingRequest(userId);
    logger.error('[ResumeAgentController] Failed to claim resume', err);
    return sendGenerationJson(res, 500, { error: 'Failed to resume' }, generationProtocolVersion);
  }
  if (!claimed) {
    await decrementPendingRequest(userId);
    const currentJob = await GenerationJobManager.getJob(streamId).catch(() => null);
    if (currentJob != null && currentJob.createdAt !== job.createdAt) {
      return sendGenerationJson(res, 409, { code: 'RUN_REPLACED' }, generationProtocolVersion);
    }
    return sendGenerationJson(
      res,
      409,
      { error: 'This action was already resolved or has expired' },
      generationProtocolVersion,
    );
  }

  /**
   * An interrupt steer enqueued just before the pause survives durably with
   * its `preempt` flag, but the ARM lived only in the previous owner's
   * runtime. Rebuild it from the queue so the resumed segment honours an
   * interrupt the user already had acknowledged.
   */
  const preemptRearm = GenerationJobManager.rearmQueuedPreempts(streamId, job.createdAt).catch(
    (error) => {
      logger.error('[ResumeAgentController] Failed to re-arm queued preempts', error);
    },
  );

  /**
   * BOUNDED, and the bound is the point. `.catch` only fires on rejection,
   * but ioredis queues commands while a connection is down instead of
   * rejecting, so either of these can simply never settle. That would block
   * here — after `approvals.resolve` has already consumed the action and
   * flipped the job to `running`, and before both `res.json` and the resume
   * lifecycle's own try/finally. The client times out, its retry gets a 409
   * because the action is spent, and neither the continuation nor the
   * failed-resume cleanup ever runs.
   *
   * Re-arming is steering bookkeeping that the next tool boundary would
   * honour anyway, so it finishes in the background rather than holding a
   * resume the user is waiting on. Capability is not in this best-effort path:
   * it was committed atomically by the resume claim above.
   */
  let steeringSetupTimer;
  await Promise.race([
    preemptRearm,
    new Promise((resolve) => {
      steeringSetupTimer = setTimeout(() => {
        logger.warn(
          `[ResumeAgentController] Steering setup for ${streamId} still pending after ` +
            `${STEER_RESUME_SETUP_TIMEOUT_MS}ms; continuing the resume without it`,
        );
        resolve();
      }, STEER_RESUME_SETUP_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(steeringSetupTimer);

  // Seed the run-scoped MCP request-context store BEFORE the ACK: once `res.json`
  // finishes the response, a later `getMCPRequestContext(req, res)` (from tool loading)
  // sees `res` as ended and returns undefined, leaving the resumed run without its MCP
  // connection store — approved MCP / OAuth-overlay tools would then run without their
  // request-scoped connections. Pre-seeding with a null `res` + `cleanupOnResponse:false`
  // mirrors the normal stream path (request.js); torn down in the `finally` below.
  req._resumableStreamId = streamId;
  getMCPRequestContext(req, undefined, { cleanupOnResponse: false });

  // ACK immediately; the continuation streams over the client's existing SSE.
  sendGenerationJson(
    res,
    200,
    { streamId, conversationId, status: 'resuming' },
    generationProtocolVersion,
  );

  // Seed the original thread parent BEFORE initializeClient: initializeAgent scopes
  // thread files / code artifacts off `req.body.parentMessageId`, and the resume body
  // doesn't carry it. This is the user message's parent (the thread position);
  // `client.parentMessageId` below is a different value — the response's parent, i.e.
  // the user message id.
  req.body.parentMessageId = job.metadata.userMessage?.parentMessageId ?? Constants.NO_PARENT;

  // Rebuild the same persistence/retention mode as the paused turn. The resume body is
  // not authoritative here: image/code tools inspect `req.body.isTemporary` during
  // initializeClient, and a missing or crafted value must not make a temporary chat's
  // artifacts durable (or make a durable chat's artifacts ephemeral).
  req.body.isTemporary = job.metadata.isTemporary === true;

  // Restore the paused user message's OWN uploaded files. initializeAgent rebuilds
  // code/file sessions by walking the conversation from `parentMessageId`, but
  // execute-code files are excluded from that lookup, so files uploaded on the paused
  // turn would be dropped — an approved code/read-file tool would resume without them.
  //
  // SECURITY: ALWAYS source files from the paused job, never from the `/resume` body.
  // `files` is not pinned by the resume fingerprint or replayed via resumeContext, so
  // honoring a client-supplied `files` array would let a crafted/buggy client resume an
  // approved code/read-file tool against a DIFFERENT file set than the one the user
  // approved. A resume reconstructs the SAME paused turn, so there is no legitimate
  // reason for the client to supply its own files. Prefer the files persisted on the JOB
  // at onStart (race-free), fall back to the DB row for older jobs, and CLEAR otherwise
  // so a client-supplied set can never leak through.
  const metaFiles = job.metadata.userMessage?.files;
  if (Array.isArray(metaFiles) && metaFiles.length > 0) {
    req.body.files = metaFiles;
  } else {
    let restoredFiles = false;
    const pausedUserMessageId = job.metadata.userMessage?.messageId;
    if (pausedUserMessageId) {
      try {
        const [row] = await getMessages(
          { conversationId, messageId: pausedUserMessageId },
          'files',
        );
        if (Array.isArray(row?.files) && row.files.length > 0) {
          req.body.files = row.files;
          restoredFiles = true;
        }
      } catch (err) {
        logger.warn(
          '[ResumeAgentController] Failed to restore paused user message files',
          err?.message ?? err,
        );
      }
    }
    if (!restoredFiles) {
      // No paused files (or the lookup failed): drop any client-supplied files so a
      // crafted resume body can't inject a file set the paused turn never had.
      req.body.files = [];
    }
  }

  // Restore the conversation's createdAt so temporal prompt vars ({{current_datetime}},
  // {{iso_datetime}}, ...) resolve against the SAME anchor the paused graph used rather
  // than the resume wall-clock. initializeAgent reads `req.conversationCreatedAt`; the
  // normal path sets it from the convo timestamp (resolveConversationCreatedAt), so mirror
  // that here. (The original `timezone` is replayed onto req.body via RESUME_CONTEXT_KEYS.)
  try {
    const resumedConvo = await getConvo(userId, conversationId);
    const createdAt = resumedConvo?.createdAt ? new Date(resumedConvo.createdAt) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      req.conversationCreatedAt = createdAt.toISOString();
    }
  } catch (err) {
    logger.warn(
      '[ResumeAgentController] Failed to restore conversation timestamp anchor',
      err?.message ?? err,
    );
  }

  let client = null;
  /** Re-pause progress failures use the action/epoch-scoped terminal CAS. The
   * generic resume catch must not subsequently call completeJob, because the
   * failed pause may have lost ownership to a newer action or generation. */
  let pausePersistenceFailed = false;
  let pausePersistenceFailureFinalized = false;
  try {
    const result = await initializeClient({
      req,
      res,
      endpointOption: req.body.endpointOption,
      signal: job.abortController.signal,
      jobCreatedAt: job.createdAt,
      checkpointNamespace,
    });
    client = result.client;

    // Bind the rebuilt client to the in-flight turn's identity (no new user message).
    client.conversationId = streamId;
    // The resume operates on the SAME job (it moved it running again), so its identity is
    // the paused job's createdAt — used by the re-pause CAS pre-check + checkpoint prune to
    // avoid acting on a job a newer request has since replaced.
    client.jobCreatedAt = job.createdAt;
    client.checkpointNamespace = checkpointNamespace;
    client.responseMessageId = job.metadata.responseMessageId;
    client.parentMessageId = job.metadata.userMessage?.messageId ?? Constants.NO_PARENT;
    // Read the pre-pause content BEFORE swapping the store's content reference: the
    // in-memory store's setContentParts REPLACES the stored array, so reading the
    // resume state afterward would see the new (empty) client array and lose the seed.
    const resumeState = await GenerationJobManager.getResumeState(streamId, job.createdAt);
    let seedContent = resumeState?.aggregatedContent ?? [];
    // Stamp retained answers onto their paused ask_user_question tool-call parts
    // (args = the pendingAction's authoritative question, output = the user's answer):
    // the streamed arg chunks carry no tool name so the aggregator dropped them, and
    // no completion event ever fires for this tool — without this the saved part is
    // an empty "cancelled-looking" tool call. See attachAskUserQuestionAnswers.
    if (resolvedAskUserQuestions) {
      seedContent = attachAskUserQuestionAnswers(seedContent, resolvedAskUserQuestions);
    }
    if (client.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts, job.createdAt);
    }

    await client.resumeCompletion({
      resumeValue: mapped.resumeValue,
      seedContent,
      runSteps: resumeState?.runSteps ?? [],
      abortController: job.abortController,
      // Carry the user's MCP auth so approved MCP tools run with their credentials.
      userMCPAuthMap: result.userMCPAuthMap,
      // Replay deferred tools discovered before the pause (captured at pause). The rebuilt
      // graph passes `messages: []`, so without these the model would lose their schemas.
      discoveredToolNames: job.metadata?.discoveredTools,
      activityPhaseSnapshot: job.metadata?.activityPhaseSnapshot,
    });

    // The model may pause AGAIN (another tool, or a follow-up question). The pending
    // action is already persisted + emitted; leave the job `requires_action`.
    if (client.pendingApproval) {
      logger.debug(`[ResumeAgentController] Re-paused for approval: ${streamId}`);
      const pauseActionId = client.pendingApproval.actionId;
      const pauseCreatedAt = client.jobCreatedAt ?? job.createdAt;
      const ownsPausePersistence = await GenerationJobManager.approvals.ownsPausePersistence(
        streamId,
        pauseActionId,
        pauseCreatedAt,
      );
      if (ownsPausePersistence) {
        try {
          // Persist this segment's content + artifacts before the fresh client (next
          // resume) drops them, so an expiring re-pause doesn't lose them; finalize later
          // overwrites content and merges attachments onto the saved message. A failed
          // required write must reject into the error-finalization path rather than expose
          // the next action while its preceding segment is absent from durable history.
          await persistRePauseProgress({ req, client, job, streamId, conversationId });
        } catch (pausePersistenceError) {
          pausePersistenceFailed = true;
          try {
            pausePersistenceFailureFinalized =
              (await GenerationJobManager.failPausePersistence(
                streamId,
                pauseActionId,
                pausePersistenceError?.message ?? 'Re-pause persistence failed',
                pauseCreatedAt,
              )) === true;
            if (!pausePersistenceFailureFinalized) {
              logger.warn(
                `[ResumeAgentController] Skipping stale re-pause persistence failure — ${streamId} no longer owns its barrier`,
              );
            }
          } catch (failError) {
            logger.error(
              `[ResumeAgentController] Failed to terminalize re-pause persistence error for ${streamId}`,
              failError,
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
            `[ResumeAgentController] Re-pause persistence barrier changed before release: ${streamId}`,
          );
        }
      } else {
        logger.debug(
          `[ResumeAgentController] Skipping stale re-pause persistence — ${streamId} no longer owns its barrier`,
        );
      }
      return;
    }

    // If the user aborted mid-resume, the abort route already emitted the terminal
    // event and finalized the job — don't double-save / double-finalize here.
    if (job.abortController.signal.aborted) {
      logger.debug(
        `[ResumeAgentController] Aborted during resume; abort route finalizes: ${streamId}`,
      );
      return;
    }

    await finalizeResumedTurn({
      req,
      client,
      job,
      streamId,
      conversationId,
      addTitle,
      checkpointGeneration,
    });
  } catch (err) {
    logger.error('[ResumeAgentController] Resume failed', err);
    if (pausePersistenceFailed) {
      // failPausePersistence already performed the exact requires_action ->
      // error transition. Only its CAS winner owns this generation's checkpoint
      // cleanup; a stale/mismatched failure must leave the live scope intact.
      if (pausePersistenceFailureFinalized) {
        await deleteFailedResumeCheckpoint(
          {
            conversationId,
            checkpointerCfg,
            job,
            checkpointGeneration,
          },
          're-pause persistence failure',
        );
      }
      return;
    }
    // Job-replacement guard (mirrors finalizeResumedTurn's success-path guard): if a
    // newer request reused this conversationId while the resume was failing, do NOT emit
    // the error to / complete / prune the NEWER turn's job. The finally still releases
    // the slot + disposes. Proceed with finalization if the replacement check itself fails.
    let stillLive = true;
    try {
      const liveJob = await GenerationJobManager.getJobStore().getJob(streamId);
      stillLive = !!liveJob && liveJob.createdAt === job.createdAt;
    } catch (readErr) {
      logger.warn('[ResumeAgentController] Replacement check failed; finalizing anyway', readErr);
    }
    if (!stillLive) {
      logger.warn(
        `[ResumeAgentController] Skipping failed-resume finalization — job ${streamId} was replaced`,
      );
    } else {
      // completeJob atomically claims running -> error and parks steers before
      // publishing. If abort or a re-pause won, it returns false; only the
      // terminal-CAS winner may delete this generation's checkpoint scope.
      let errorFinalized = false;
      try {
        errorFinalized =
          (await GenerationJobManager.completeJob(
            streamId,
            err?.message ?? 'Resume failed',
            job.createdAt,
          )) === true;
      } catch (completeErr) {
        logger.error('[ResumeAgentController] Failed to finalize failed resume', completeErr);
      }
      if (errorFinalized) {
        await deleteFailedResumeCheckpoint(
          {
            conversationId,
            checkpointerCfg,
            job,
            checkpointGeneration,
          },
          'failed resume finalization',
        );
      }
    }
  } finally {
    // Tear down the MCP request-context store seeded before the ACK (parity with
    // request.js's finishResumableRequest). No-op if it was never seeded.
    await cleanupMCPRequestContextForReq(req);
    // Release the concurrency slot taken above — UNLESS handleRunInterrupt already
    // released it on a re-pause (so a fast /resume isn't 429'd). On a normal finish or
    // error it didn't, so release here. A re-pause re-acquires its own slot next resume.
    if (!client?.pendingRequestReleased) {
      await decrementPendingRequest(userId);
    }
    if (client) {
      disposeClient(client);
    }
  }
};

module.exports = ResumeAgentController;
