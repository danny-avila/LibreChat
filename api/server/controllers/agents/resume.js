const { logger } = require('@librechat/data-schemas');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const {
  GenerationJobManager,
  isPendingActionStale,
  mapToolApprovalResolutions,
  mapAskUserAnswer,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  deleteAgentCheckpoint,
  buildAbortedResponseMetadata,
  sanitizeMessageForTransmit,
} = require('@librechat/api');
const { disposeClient } = require('~/server/cleanup');
const { saveMessage, getConvo } = require('~/models');

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
    return { resumeValue: mapToolApprovalResolutions(resolutions) };
  }
  if (payload?.type === 'ask_user_question') {
    if (typeof body.answer !== 'string' || body.answer.length === 0) {
      return { status: 400, error: 'An answer is required' };
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
  const parentMessageId = userMessage?.messageId ?? Constants.NO_PARENT;
  const responseMessageId = meta.responseMessageId ?? `${userMessage?.messageId ?? 'resumed'}_`;
  // Sourced from the paused job (persisted at creation), not the resume body — a
  // temporary chat must stay temporary on resume so its messages aren't persisted.
  const isTemporary = meta.isTemporary ?? req.body?.isTemporary;

  // Read the raw job data BEFORE completeJob deletes it — its tracked token/context
  // usage backs the response message's cost rollup (parity with normal completion).
  const jobData = await GenerationJobManager.getJobStore().getJob(streamId);
  // Prefer the resumed run's live content: it's complete (seeded with the pre-pause
  // content) and avoids a Redis re-read that can race appendChunk writes still in
  // flight. Fall back to the aggregated store content only when the live array is empty.
  const liveContent = Array.isArray(client?.contentParts) ? client.contentParts : [];
  const content =
    liveContent.length > 0
      ? liveContent
      : ((await GenerationJobManager.getResumeState(streamId))?.aggregatedContent ?? []);

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
  const responseMetadata = jobData ? buildAbortedResponseMetadata(jobData) : null;
  if (responseMetadata) {
    responseMessage.metadata = responseMetadata;
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
    parentMessageId === Constants.NO_PARENT &&
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

  const finalEvent = {
    final: true,
    conversation,
    title: conversation.title,
    requestMessage: userMessage
      ? sanitizeMessageForTransmit({ ...userMessage, conversationId, isCreatedByUser: true })
      : null,
    responseMessage: { ...responseMessage },
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

  // The resume must rebuild the SAME agent that paused. A client passing a different
  // agent_id (even one it can access) would resume Agent A's checkpoint state on
  // Agent B's graph. The conversation's agent is stable, so a correct client always
  // sends the right one — reject a mismatch rather than silently swapping agents.
  const originalAgentId = job.metadata?.agent_id;
  if (originalAgentId && req.body.agent_id && req.body.agent_id !== originalAgentId) {
    return res.status(403).json({ error: 'Cannot resume with a different agent' });
  }

  const pendingAction = job.metadata?.pendingAction;
  if (job.status !== 'requires_action' || isPendingActionStale({ pendingAction })) {
    return res.status(409).json({ error: 'No live pending action to resume' });
  }
  if (actionId && pendingAction.actionId !== actionId) {
    return res.status(409).json({ error: 'This decision targets a stale action' });
  }

  const mapped = resolveResumeValue(pendingAction, req.body);
  if (mapped.error) {
    return res.status(mapped.status).json({ error: mapped.error, undecided: mapped.undecided });
  }

  // Atomically claim the resume. The single winner drives the run; a racing second
  // submit (double-click, two tabs) gets false and must not re-drive — that would
  // re-execute tools and double-bill.
  const claimed = await GenerationJobManager.approvals.resolve(streamId, pendingAction.actionId);
  if (!claimed) {
    return res.status(409).json({ error: 'This action was already resolved or has expired' });
  }

  // ACK immediately; the continuation streams over the client's existing SSE.
  res.json({ streamId, conversationId, status: 'resuming' });
  req._resumableStreamId = streamId;

  // Seed the original thread parent BEFORE initializeClient: initializeAgent scopes
  // thread files / code artifacts off `req.body.parentMessageId`, and the resume body
  // doesn't carry it. This is the user message's parent (the thread position);
  // `client.parentMessageId` below is a different value — the response's parent, i.e.
  // the user message id.
  req.body.parentMessageId = job.metadata.userMessage?.parentMessageId ?? Constants.NO_PARENT;

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
    client.responseMessageId = job.metadata.responseMessageId;
    client.parentMessageId = job.metadata.userMessage?.messageId ?? Constants.NO_PARENT;
    if (client.contentParts) {
      GenerationJobManager.setContentParts(streamId, client.contentParts);
    }

    const resumeState = await GenerationJobManager.getResumeState(streamId);
    const seedContent = resumeState?.aggregatedContent ?? [];

    await client.resumeCompletion({
      resumeValue: mapped.resumeValue,
      seedContent,
      abortController: job.abortController,
    });

    // The model may pause AGAIN (another tool, or a follow-up question). The pending
    // action is already persisted + emitted; leave the job `requires_action`.
    if (client.pendingApproval) {
      logger.debug(`[ResumeAgentController] Re-paused for approval: ${streamId}`);
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
        .updateJob(streamId, { status: 'error', completedAt: Date.now(), error: 'Resume failed' })
        .catch((updErr) =>
          logger.error('[ResumeAgentController] Fallback job finalize failed', updErr),
        );
    }
    await deleteAgentCheckpoint(
      conversationId,
      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
    );
  } finally {
    if (client) {
      disposeClient(client);
    }
  }
};

module.exports = ResumeAgentController;
