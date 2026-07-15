const { logger } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const {
  GenerationJobManager,
  isPendingActionStale,
  mapToolApprovalResolutions,
  mapAskUserAnswer,
  attachAskUserQuestionAnswer,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  findIncompleteDecisions,
  computeAgentRequestFingerprint,
  deleteAgentCheckpoint,
  buildAbortedResponseMetadata,
  sanitizeMessageForTransmit,
  filterMalformedContentParts,
  decrementPendingRequest,
  checkAndIncrementPendingRequest,
  toPendingSteer,
} = require('@librechat/api');
const { disposeClient } = require('~/server/cleanup');
const {
  getMCPRequestContext,
  cleanupMCPRequestContextForReq,
} = require('~/server/services/MCPRequestContext');
const { saveMessage, getConvo, getMessages } = require('~/models');

/**
 * Upper bound on an `ask_user_question` answer (characters). Generous for any real
 * reply typed into the question card while still bounding what a crafted POST can
 * inject into the resumed run's ToolMessage.
 */
const MAX_ASK_ANSWER_LENGTH = 16_000;

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
async function resolveSegmentContent(client, streamId) {
  const liveContent = Array.isArray(client?.contentParts) ? client.contentParts : [];
  const rawContent =
    liveContent.length > 0
      ? liveContent
      : ((await GenerationJobManager.getResumeState(streamId))?.aggregatedContent ?? []);
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
  const content = await resolveSegmentContent(client, streamId);
  const attachments = await resolveAccumulatedAttachments({
    client,
    conversationId,
    responseMessageId,
  });
  if (content.length === 0 && attachments.length === 0) {
    return;
  }
  try {
    await saveMessage(
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
  } catch (err) {
    logger.error('[ResumeAgentController] Failed to persist re-pause progress', err);
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
    if (typeof body.answer !== 'string' || body.answer.length === 0) {
      return { status: 400, error: 'An answer is required' };
    }
    // The answer becomes a ToolMessage the model must ingest — bound it like any
    // other user-controlled wire field rather than trusting the client.
    if (body.answer.length > MAX_ASK_ANSWER_LENGTH) {
      return { status: 400, error: 'Answer exceeds the maximum length' };
    }
    return { resumeValue: mapAskUserAnswer({ answer: body.answer }) };
  }
  return { status: 400, error: 'Unsupported pending action type' };
}

/**
 * Finalize a resumed turn that ran to completion: persist the (now complete)
 * response message, emit the terminal event over the existing SSE, complete the
 * job, and prune the checkpoint. Mirrors the abort route's save shape but for a
 * successful finish. Best-effort title generation for a first-turn pause.
 */
async function finalizeResumedTurn({ req, client, job, streamId, conversationId, addTitle }) {
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
      : ((await GenerationJobManager.getResumeState(streamId))?.aggregatedContent ?? []);
  // Parity with the normal agents path (AgentClient strips these before saving):
  // drop empty/malformed tool_call parts so a resumed turn can't persist an invalid
  // part that breaks reload/rendering.
  const content = filterMalformedContentParts(rawContent);

  const responseMessage = {
    messageId: responseMessageId,
    parentMessageId,
    conversationId,
    content,
    sender: meta.sender ?? client?.sender ?? 'AI',
    endpoint: meta.endpoint,
    iconURL: meta.iconURL,
    model: meta.model,
    unfinished: false,
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

  await saveMessage(
    { userId, isTemporary, interfaceConfig: req?.config?.interfaceConfig },
    responseMessage,
    { context: 'api/server/controllers/agents/resume.js - resumed response end' },
  );

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
          return GenerationJobManager.emitChunk(streamId, {
            event: 'title',
            data: { conversationId: titleConvoId, title },
          });
        },
      });
    } catch (err) {
      logger.error('[ResumeAgentController] Title generation failed after resume', err);
    }
  }
  conversation.title = conversation.title || 'New Chat';

  // Re-check ownership immediately before the terminal writes. The start-of-function
  // guard can go stale across the awaits above: saveMessage and (first-turn) title
  // generation can take long enough for a new request to replace this job on the same
  // conversationId (streamId == conversationId). Without this second read, emitDone /
  // completeJob / prune below would emit `done` to and tear down the REPLACEMENT job —
  // the same hazard the catch-path guard prevents on the failure path.
  const liveJobBeforeFinalize = await GenerationJobManager.getJobStore().getJob(streamId);
  if (!liveJobBeforeFinalize || liveJobBeforeFinalize.createdAt !== job.createdAt) {
    logger.warn(
      `[ResumeAgentController] Skipping resumed terminal writes — job ${streamId} was replaced mid-finalize`,
    );
    return;
  }

  // Steers that never reached an injection boundary during the resumed
  // segment — mirror the normal request path's terminal drain: the atomic
  // close (createdAt-guarded) rejects a steer POST racing this finalization,
  // and the leftovers ride the final event as queued follow-ups instead of
  // being 202-ACKed and then silently cleared by completeJob.
  let pendingSteers;
  try {
    const leftoverSteers = await GenerationJobManager.steering.closeAndDrain(
      streamId,
      job.createdAt,
    );
    if (leftoverSteers.length > 0) {
      pendingSteers = leftoverSteers.map(toPendingSteer);
      // Same no-subscriber recovery as the normal final path (claim-on-read
      // via /chat/status within the recovery TTL). NOTE: `job` is the manager
      // facade — owner fields live under `metadata` (a bare `job.userId` is
      // undefined and would make the parked payload unclaimable).
      await GenerationJobManager.steering.park(streamId, pendingSteers, {
        userId: job.metadata?.userId,
        tenantId: job.metadata?.tenantId,
      });
    }
  } catch (drainErr) {
    logger.warn('[ResumeAgentController] Failed to drain leftover steers', drainErr);
  }

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
    ...(pendingSteers && { pendingSteers }),
  };

  await GenerationJobManager.emitDone(streamId, finalEvent);
  // Awaited (not fire-and-forget) so the job's terminal write lands before the
  // checkpoint prune, and so a failure here doesn't race the controller's error path.
  try {
    await GenerationJobManager.completeJob(streamId);
  } catch (completeErr) {
    logger.error('[ResumeAgentController] Failed to complete resumed turn', completeErr);
  }
  await deleteAgentCheckpoint(conversationId, checkpointerCfg);
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
  const { conversationId, actionId } = req.body;
  const streamId = conversationId;

  if (!streamId || streamId === 'new') {
    return res.status(400).json({ error: 'conversationId is required to resume' });
  }

  const job = await GenerationJobManager.getJob(streamId);
  if (!job) {
    return res.status(404).json({ error: 'No paused generation for this conversation' });
  }
  if (job.metadata?.userId && job.metadata.userId !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  if (hasTenantMismatch(job, req.user)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // The resume must rebuild the SAME agent/endpoint that paused. Require an EXACT
  // agent_id match when the paused job had one — a request that omits agent_id (or
  // claims an ephemeral / non-agents endpoint) must not rebuild the claimed checkpoint
  // on a different graph. The conversation's agent is stable, so a correct client always
  // sends the right one.
  const originalAgentId = job.metadata?.agent_id;
  if (originalAgentId && req.body.agent_id !== originalAgentId) {
    return res.status(403).json({ error: 'Cannot resume with a different agent' });
  }
  // Require an EXACT endpoint match (like agent_id): a request that OMITS endpoint must
  // not fall through — the shared chat middleware treats a missing/non-agents endpoint
  // as the ephemeral agent, so omitting it could rebuild the claimed checkpoint on a
  // different graph. A correct client always echoes the paused endpoint.
  const originalEndpoint = job.metadata?.endpoint;
  if (originalEndpoint && req.body.endpoint !== originalEndpoint) {
    return res.status(403).json({ error: 'Cannot resume on a different endpoint' });
  }

  const pendingAction = job.metadata?.pendingAction;
  if (job.status !== 'requires_action') {
    return res.status(409).json({ error: 'No live pending action to resume' });
  }
  if (isPendingActionStale({ pendingAction })) {
    // The action expired between the pending-action SSE and this submit. Drive the expiry
    // NOW (expire CAS + terminal SSE) instead of waiting for the periodic sweeper —
    // otherwise the job sits `requires_action` with a dead action and any attached SSE
    // client never gets a terminal event, so the stream appears to hang even though the
    // UI already reported the action as expired.
    try {
      await GenerationJobManager.expireApproval(streamId, pendingAction?.actionId);
    } catch (err) {
      logger.warn(
        '[ResumeAgentController] Failed to expire stale action on submit',
        err?.message ?? err,
      );
    }
    return res.status(409).json({ error: 'No live pending action to resume' });
  }
  // Require the actionId the UI sends: without it, a stale/malformed client could
  // resolve whatever action is currently pending (e.g. answer a different question).
  if (!actionId) {
    return res.status(400).json({ error: 'actionId is required to resume' });
  }
  if (pendingAction.actionId !== actionId) {
    return res.status(409).json({ error: 'This decision targets a stale action' });
  }

  // Pin the graph identity: the resume must rebuild the SAME agent/graph + tool set the
  // run paused on. The agent_id + endpoint guards above cover saved agents; the
  // fingerprint additionally catches an ephemeral-agent config swap (its agent_id is
  // undefined, so the id guard can't tell two ephemeral configs apart). Enforced only
  // when the paused action carries a fingerprint (in-flight pauses from before this
  // change won't), and recomputed from the resume body's graph-determining fields.
  const pinnedFingerprint = pendingAction.requestFingerprint;
  if (pinnedFingerprint && pinnedFingerprint !== computeAgentRequestFingerprint(req.body ?? {})) {
    return res.status(403).json({ error: 'Cannot resume with a different agent configuration' });
  }

  const mapped = resolveResumeValue(pendingAction, req.body);
  if (mapped.error) {
    return res.status(mapped.status).json({
      error: mapped.error,
      ...(mapped.undecided && { undecided: mapped.undecided }),
      ...(mapped.disallowed && { disallowed: mapped.disallowed }),
      ...(mapped.incomplete && { incomplete: mapped.incomplete }),
    });
  }

  // Count the resume against the concurrency limit. The original turn released its slot
  // when it paused, so resuming must re-acquire one — otherwise pausing several turns
  // and resuming them at once would bypass LIMIT_CONCURRENT_MESSAGES.
  const { allowed } = await checkAndIncrementPendingRequest(userId);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many concurrent requests' });
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
  try {
    claimed = await GenerationJobManager.approvals.resolve(streamId, pendingAction.actionId);
  } catch (err) {
    await decrementPendingRequest(userId);
    logger.error('[ResumeAgentController] Failed to claim resume', err);
    return res.status(500).json({ error: 'Failed to resume' });
  }
  if (!claimed) {
    await decrementPendingRequest(userId);
    return res.status(409).json({ error: 'This action was already resolved or has expired' });
  }

  // Seed the run-scoped MCP request-context store BEFORE the ACK: once `res.json`
  // finishes the response, a later `getMCPRequestContext(req, res)` (from tool loading)
  // sees `res` as ended and returns undefined, leaving the resumed run without its MCP
  // connection store — approved MCP / OAuth-overlay tools would then run without their
  // request-scoped connections. Pre-seeding with a null `res` + `cleanupOnResponse:false`
  // mirrors the normal stream path (request.js); torn down in the `finally` below.
  req._resumableStreamId = streamId;
  getMCPRequestContext(req, undefined, { cleanupOnResponse: false });

  // ACK immediately; the continuation streams over the client's existing SSE.
  res.json({ streamId, conversationId, status: 'resuming' });

  // Seed the original thread parent BEFORE initializeClient: initializeAgent scopes
  // thread files / code artifacts off `req.body.parentMessageId`, and the resume body
  // doesn't carry it. This is the user message's parent (the thread position);
  // `client.parentMessageId` below is a different value — the response's parent, i.e.
  // the user message id.
  req.body.parentMessageId = job.metadata.userMessage?.parentMessageId ?? Constants.NO_PARENT;

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
  try {
    const result = await initializeClient({
      req,
      res,
      endpointOption: req.body.endpointOption,
      signal: job.abortController.signal,
    });
    client = result.client;

    // Bind the rebuilt client to the in-flight turn's identity (no new user message).
    client.conversationId = streamId;
    // The resume operates on the SAME job (it moved it running again), so its identity is
    // the paused job's createdAt — used by the re-pause CAS pre-check + checkpoint prune to
    // avoid acting on a job a newer request has since replaced.
    client.jobCreatedAt = job.createdAt;
    client.responseMessageId = job.metadata.responseMessageId;
    client.parentMessageId = job.metadata.userMessage?.messageId ?? Constants.NO_PARENT;
    // Read the pre-pause content BEFORE swapping the store's content reference: the
    // in-memory store's setContentParts REPLACES the stored array, so reading the
    // resume state afterward would see the new (empty) client array and lose the seed.
    const resumeState = await GenerationJobManager.getResumeState(streamId);
    let seedContent = resumeState?.aggregatedContent ?? [];
    // Stamp the answered question onto the paused ask_user_question tool-call part
    // (args = the pendingAction's authoritative question, output = the user's answer):
    // the streamed arg chunks carry no tool name so the aggregator dropped them, and
    // no completion event ever fires for this tool — without this the saved part is
    // an empty "cancelled-looking" tool call. See attachAskUserQuestionAnswer.
    if (pendingAction.payload?.type === 'ask_user_question') {
      seedContent = attachAskUserQuestionAnswer(
        seedContent,
        pendingAction.payload.question,
        req.body.answer,
      );
    }
    if (client.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts);
    }

    await client.resumeCompletion({
      resumeValue: mapped.resumeValue,
      seedContent,
      abortController: job.abortController,
      // Carry the user's MCP auth so approved MCP tools run with their credentials.
      userMCPAuthMap: result.userMCPAuthMap,
      // Replay deferred tools discovered before the pause (captured at pause). The rebuilt
      // graph passes `messages: []`, so without these an approved deferred tool would be
      // absent from the schema-only toolMap and resume would fail with "unknown tool".
      discoveredToolNames: job.metadata?.discoveredTools,
    });

    // The model may pause AGAIN (another tool, or a follow-up question). The pending
    // action is already persisted + emitted; leave the job `requires_action`.
    if (client.pendingApproval) {
      logger.debug(`[ResumeAgentController] Re-paused for approval: ${streamId}`);
      // Persist this segment's content + artifacts before the fresh client (next
      // resume) drops them, so an expiring re-pause doesn't lose them; finalize later
      // overwrites content and merges attachments onto the saved message.
      await persistRePauseProgress({ req, client, job, streamId, conversationId });
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

    await finalizeResumedTurn({ req, client, job, streamId, conversationId, addTitle });
  } catch (err) {
    logger.error('[ResumeAgentController] Resume failed', err);
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
      // A steer 202-accepted during the failed resume segment would otherwise
      // be silently cleared by completeJob's backstop — mirror the normal
      // request error path: close the queue BEFORE the error event (racing
      // steer POSTs get 404) and park the leftovers for /chat/status recovery.
      try {
        const leftoverSteers = await GenerationJobManager.steering.closeAndDrain(
          streamId,
          job.createdAt,
        );
        if (leftoverSteers.length > 0) {
          // Facade shape: owner fields are under `metadata` (see finalize).
          await GenerationJobManager.steering.park(streamId, leftoverSteers.map(toPendingSteer), {
            userId: job.metadata?.userId,
            tenantId: job.metadata?.tenantId,
          });
        }
      } catch (drainErr) {
        logger.warn('[ResumeAgentController] Failed to drain steers on resume failure', drainErr);
      }
      try {
        await GenerationJobManager.emitError(streamId, err?.message ?? 'Resume failed');
      } catch (emitErr) {
        logger.error('[ResumeAgentController] Failed to emit resume error', emitErr);
      }
      try {
        await GenerationJobManager.completeJob(streamId, err?.message ?? 'Resume failed');
      } catch (completeErr) {
        logger.error('[ResumeAgentController] Failed to finalize failed resume', completeErr);
        // Last resort: force a terminal state so the job isn't orphaned in `running`.
        await GenerationJobManager.getJobStore()
          .updateJob(streamId, {
            status: 'error',
            completedAt: Date.now(),
            error: 'Resume failed',
          })
          .catch((updErr) =>
            logger.error('[ResumeAgentController] Fallback job finalize failed', updErr),
          );
      }
      await deleteAgentCheckpoint(
        conversationId,
        req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
      );
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
