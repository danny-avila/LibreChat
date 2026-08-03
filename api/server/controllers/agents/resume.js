const { randomUUID } = require('crypto');
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
const {
  isBalanceViolationError,
  classifyScheduleOutcome,
} = require('~/server/controllers/agents/errors');
const { disposeClient } = require('~/server/cleanup');
const {
  getMCPRequestContext,
  cleanupMCPRequestContextForReq,
} = require('~/server/services/MCPRequestContext');
const {
  recordScheduleOutcome,
  isScheduleLive,
  clearScheduledJob,
  awaitStopAbortPersistence,
  markScheduledRunResumeClaimed,
} = require('~/server/services/Schedules');
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
 * Settles a scheduled run whose RESUMED generation was aborted. The abort route
 * settles only jobs it caught paused; a resumed job is `running` at the abort CAS,
 * making this controller the generation owner and therefore the settler — after the
 * route's persistence barrier (its checkpoint prune and partial save must land
 * before the run leaves the active set deletion drains confirm on). FAILS CLOSED:
 * an unconfirmed barrier skips the settle and leaves the run for the reconciler,
 * which finalizes it from the preserved aborted job once the owner-death fence
 * lapses.
 */
async function settleAbortedScheduledResume(job, streamId, conversationId) {
  const scheduleId = job.metadata?.scheduleId;
  const scheduledFor = job.metadata?.scheduledFor;
  if (!scheduleId || !scheduledFor) {
    return;
  }
  const cleared = await awaitStopAbortPersistence(scheduleId, new Date(scheduledFor)).catch(
    (err) => {
      logger.warn('[ResumeAgentController] Stop-abort persistence barrier failed', err);
      return false;
    },
  );
  if (!cleared) {
    logger.warn(
      `[ResumeAgentController] Aborted resume left for the reconciler (barrier unconfirmed): ${streamId}`,
    );
    return;
  }
  const recorded = await recordScheduleOutcome({
    scheduleId,
    scheduledFor,
    status: 'interrupted',
    conversationId,
  });
  // Reconcile only scans ACTIVE runs; with the run terminal, nothing else would
  // ever reap the job the abort route preserved as evidence.
  if (recorded) {
    await clearScheduledJob(streamId, { scheduleId, scheduledFor }).catch((err) =>
      logger.warn('[ResumeAgentController] Failed to clear reconciled job', err),
    );
  }
}

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

/**
 * The schedule outcome for a resumed turn that reached finalize. resumeCompletion
 * deliberately swallows continuation errors into an ERROR content part (the
 * interactive UX finalizes with the error visible), surfacing them on
 * `client.resumeError` — so a mid-continuation failure must be classified HERE, not in
 * the catch below, which never runs for it. A balance refusal walks the
 * insufficient_balance policy; every OTHER swallowed error is a genuine failure, and
 * recording it as `success` reset the consecutive-failure streak, so a schedule whose
 * every run dies on the provider call never reached `autoDisableAfterFailures` and
 * retried forever. Aborts never land here — the client only records the error on its
 * non-aborted branch.
 */
function resumedOutcomeStatus(client) {
  return classifyScheduleOutcome(client?.resumeError, 'Resumed run ended in error');
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
    // The RUN's identity is (scheduleId, scheduledFor), independent of who owns the
    // conversationId now, so it still has to be settled — otherwise the row stays
    // active, holds its capacity slot and blocks account deletion until the orphan
    // sweep. Nothing was persisted before this guard, so `interrupted` is the honest
    // status rather than claiming output this turn never wrote.
    if (job.metadata?.scheduleId) {
      await recordScheduleOutcome({
        scheduleId: job.metadata.scheduleId,
        scheduledFor: job.metadata.scheduledFor,
        status: 'interrupted',
        conversationId,
        error: 'Conversation was taken over by a newer turn',
      });
    }
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

  // Fence BEFORE the CAS, fail closed: the claim drops this job out of the active set
  // while the response save (and the first-turn title's billed writes) are still
  // ahead, so a deletion quiesce landing in that window would otherwise see neither an
  // active job nor a marker and cascade while this resume can still recreate messages.
  // Generation-qualified (job.createdAt) so a predecessor's late clear can never drop
  // this generation's marker. Throwing routes to the controller catch, whose own
  // fenced settlement either registers its marker or leaves the job paused/active —
  // deletion-visible either way. Cleared in the persistence try's finally.
  let finalizationRegistered = false;
  for (let attempt = 1; attempt <= 2 && !finalizationRegistered; attempt++) {
    finalizationRegistered = await GenerationJobManager.registerUserFinalization(
      userId,
      streamId,
      req.user?.tenantId,
      job.createdAt,
    )
      .then(() => true)
      .catch((err) => {
        logger.warn(
          `[ResumeAgentController] Finalization registration failed (attempt ${attempt}/2): ${streamId}`,
          err,
        );
        return false;
      });
  }
  if (!finalizationRegistered) {
    throw new Error('Finalization marker unavailable before resumed terminal persistence');
  }
  const clearFinalization = () => {
    void GenerationJobManager.clearUserFinalization(
      userId,
      streamId,
      req.user?.tenantId,
      job.createdAt,
    ).catch(() => undefined);
  };

  // Win terminal ownership BEFORE the outcome-defining response write. Stop
  // and completion both write the same Mongo row; a later liveness read cannot
  // fence that external write, while this CAS gives exactly one side authority.
  // The durable pending marker keeps status/subscribers on the readiness path
  // until the winner has persisted and published its FINAL.
  let terminalClaim;
  try {
    terminalClaim = await GenerationJobManager.claimTerminalJob(
      streamId,
      'complete',
      undefined,
      job.createdAt,
      {
        persistencePending: true,
        // The terminal CAS necessarily precedes the schedule-outcome write below, and the
        // claim is frozen, so a scheduled fire must be claimed RETAINED (terminal WITHOUT
        // `completedAt`): that record is the only evidence a reconciler could read if the
        // outcome write never lands. The settlement below reaps it via `clearScheduledJob`
        // as soon as the outcome IS durable. The intended outcome rides along, because
        // `complete` alone cannot tell the reconciler a balance refusal (or a swallowed
        // provider failure) from a clean finish.
        ...(meta.scheduleId
          ? { preserveForReconcile: true, scheduleOutcome: resumedOutcomeStatus(client) }
          : {}),
      },
    );
  } catch (claimError) {
    // No CAS won means no persistence follows from this call: release the marker
    // now instead of holding the user's deletion behind its TTL.
    clearFinalization();
    throw claimError;
  }
  if (!terminalClaim) {
    logger.warn(
      `[ResumeAgentController] Skipping resumed FINAL — another terminal/pause transition won for ${streamId}`,
    );
    // Do NOT record success here. The response save is BELOW this claim (the terminal
    // CAS deliberately precedes the outcome-defining write), so a lost claim means this
    // occurrence persisted nothing — and recording it as produced output would also skip
    // the winner's persistence barrier, releasing the run's capacity slot while Stop was
    // still writing. Settlement belongs to whoever won: a pause writes
    // `requires_action`, any other terminal winner writes its own outcome, and an abort
    // leaves THIS controller the settler for a resumed (running-at-CAS) run — which
    // `settleAbortedScheduledResume` does behind the barrier, failing closed.
    if (meta.scheduleId) {
      const winner = await GenerationJobManager.getJob(streamId).catch((err) => {
        logger.warn(
          `[ResumeAgentController] Could not identify the terminal winner for ${streamId}`,
          err,
        );
        return null;
      });
      if (winner?.createdAt === job.createdAt && winner.status === 'aborted') {
        await settleAbortedScheduledResume(job, streamId, conversationId);
      }
    }
    clearFinalization();
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
      try {
        await deleteResumedGenerationCheckpoint({
          conversationId,
          checkpointerCfg,
          job,
          checkpointGeneration,
        });
      } catch (checkpointError) {
        // Observable, but it must not escape: the FINAL is already published by this
        // point, so a prune failure throwing here would skip the schedule settlement
        // below and have the controller catch record `error` for a run that COMPLETED.
        logger.error(
          `[ResumeAgentController] Failed to prune checkpoint after resumed finalization for ${streamId}`,
          checkpointError,
        );
      }
      // Every data-recreating write this resume owns (response save, first-turn
      // title, FINAL publication) has now either landed or failed for good — on
      // both paths, since this runs in the persistence try's finally. Left
      // registered, the TTL would fence this user's deletion pointlessly.
      clearFinalization();
    }
  }

  // Settle the scheduled RUN after publication, from the paused job's metadata: for a
  // scheduled fire that paused for approval, THIS resume is the completion point and the
  // reconciler cannot derive it once the job is gone. The claim above was taken RETAINED
  // for every scheduled fire, so the completedAt-less terminal job survives the finish
  // and is this occurrence's evidence until the outcome write lands — dying in between
  // can only make the reconciler re-derive the same outcome, never mislabel a finished
  // run as interrupted.
  if (meta.scheduleId) {
    const scheduleOutcomeRecorded = await recordScheduleOutcome({
      scheduleId: meta.scheduleId,
      scheduledFor: meta.scheduledFor,
      ...resumedOutcomeStatus(client),
      conversationId,
    });
    // Only reap the retained job once the outcome is durable: reconcile never rescans a
    // terminal run, so nothing else would ever clear it. Identity- and generation-fenced,
    // so a replacement generation is never destroyed.
    if (scheduleOutcomeRecorded) {
      await clearScheduledJob(streamId, {
        scheduleId: meta.scheduleId,
        scheduledFor: meta.scheduledFor,
      }).catch((err) => logger.warn('[ResumeAgentController] Failed to clear reconciled job', err));
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
  // A scheduled run's approval must not start a NEW billed generation once its schedule
  // stopped being live. Account deletion marks every schedule `deleting` as its FIRST
  // step, before draining; without this a resume landing mid-drain promotes the job to
  // `running` after the drain already judged it settleable, so quiesce reports the
  // account drained while a generation is still persisting messages for it. Also covers
  // an owner delete/edit landing while the prompt sat unanswered.
  // The revision the fire was CLAIMED under, replayed so the resume applies the same
  // fence the fire boundary did: an owner edit landing while the approval sat unanswered
  // means the paused turn's prompt/agent came from a config that has since been
  // replaced. Absent on either side leaves the fence off, so older jobs keep working.
  const pausedConfigRevision =
    job.metadata?.scheduleConfigRevision != null
      ? Number(job.metadata.scheduleConfigRevision)
      : undefined;
  if (
    job.metadata?.scheduleId &&
    !(await isScheduleLive(job.metadata.scheduleId, pausedConfigRevision, {
      // An AUTOMATIC occurrence must not resume onto a schedule that has since been
      // auto-disabled: the policy flips `enabled` without touching configRevision, so
      // no other gate here can see it, and approving hours later would run a fresh
      // billed turn for a schedule the system already switched off.
      automatic: job.metadata.scheduleManual !== '1',
      // Re-apply the LIVE dispatch policy (global kill switch, owner availability,
      // SCHEDULES:USE) the fire path checked: all three can change while the
      // approval sits unanswered, and none of them touch the row.
      policy: true,
    }))
  ) {
    logger.info(
      `[ResumeAgentController] Refusing resume for a schedule no longer live: ${job.metadata.scheduleId}`,
    );
    try {
      await GenerationJobManager.expireApproval(streamId, pendingAction?.actionId, job.createdAt);
    } catch (err) {
      logger.warn(
        '[ResumeAgentController] Failed to expire action on a dead schedule',
        err?.message ?? err,
      );
    }
    return sendGenerationJson(
      res,
      409,
      { error: 'This scheduled run is no longer active' },
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

  // v1 scope: the scheduler does NOT orchestrate resumes. A scheduled run that pauses
  // for approval released its capacity slot on pause and is handed off — from here it is
  // an ordinary paused conversation the user resumes through the chat UI. The scheduler
  // only OBSERVES the eventual outcome below (so the schedule card reflects it); it does
  // not reserve, lease, or fence this resume. Scheduled HITL orchestration is a
  // fast-follow behind the experimental flag.
  // Atomically claim the resume. The single winner drives the run; a racing second
  // submit (double-click, two tabs) gets false and must not re-drive — that would
  // re-execute tools and double-bill. Do NOT release the reservation on a lost claim:
  // the claim winner drives the `started` run this (or the concurrent same-pause)
  // request reserved, and an unreserved-but-promoted row is healed by the reconciler.
  let claimed;
  let checkpointGeneration;
  const providerExecutionId = randomUUID();
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
        providerExecutionId,
        providerDrained: true,
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

  // RE-CHECK after winning the CAS, not only before it. The pre-claim check above is
  // ~100 lines and a concurrency round trip away from this point, and a schedule delete
  // or account-deletion drain can begin in that window: the drain reads the job, sees
  // `requires_action`, judges it settleable and terminalizes the run — then this resume
  // promotes the job and generates for a schedule (or account) already torn down.
  // Ordering it AFTER the claim is what closes the race rather than narrowing it: the
  // CAS is what promotes the job to `running`, so a drain that starts after this point
  // observes a running generation and waits for it, while one that started before it is
  // caught here.
  if (job.metadata?.scheduleId) {
    // Stamp the run RESUME-CLAIMED before anything else: from here until the pause
    // record (or the terminal outcome) this run's writes are a hand-off in flight,
    // and a deletion drain observing a RE-PAUSED job mid-branch must defer rather
    // than settle while persistRePauseProgress is still landing. The pause record
    // clears the stamp; a crash leaves it to age out on the staleness bound.
    await markScheduledRunResumeClaimed(
      job.metadata.scheduleId,
      new Date(job.metadata.scheduledFor),
    );
    const stillLive = await isScheduleLive(job.metadata.scheduleId, pausedConfigRevision, {
      policy: true,
      automatic: job.metadata.scheduleManual !== '1',
    }).catch(() => false);
    if (!stillLive) {
      logger.info(
        `[ResumeAgentController] Schedule ${job.metadata.scheduleId} went away mid-resume; ` +
          'aborting the claimed turn before it generates',
      );
      // PRESERVE until the outcome is durable: the default abort deletes the job, and
      // if the Mongo write below exhausts its retries that job is the only evidence the
      // run stopped. Retained, reconcile settles it; deleted, the row is stranded.
      await GenerationJobManager.abortJob(streamId, {
        expectedCreatedAt: job.createdAt,
        preserveForReconcile: true,
      }).catch((err) =>
        logger.warn('[ResumeAgentController] Failed to abort a superseded resume', err),
      );
      // Settle the run too. The CAS already promoted it out of `requires_action`, so
      // without this the row stays active with no generation — holding a capacity slot
      // and blocking deletion until the orphan sweep.
      const settled = await recordScheduleOutcome({
        scheduleId: job.metadata.scheduleId,
        scheduledFor: job.metadata.scheduledFor,
        status: 'interrupted',
        conversationId,
        error: 'Schedule was no longer active when the approval was answered',
      });
      // Only once the outcome is durable is the retained job disposable; reconcile no
      // longer scans a settled run, so nothing else would reap it.
      if (settled) {
        await clearScheduledJob(streamId, {
          scheduleId: job.metadata.scheduleId,
          scheduledFor: job.metadata.scheduledFor,
        }).catch((err) =>
          logger.warn('[ResumeAgentController] Failed to clear a superseded resume job', err),
        );
      }
      await decrementPendingRequest(userId);
      return sendGenerationJson(
        res,
        409,
        { error: 'This scheduled run is no longer active' },
        generationProtocolVersion,
      );
    }
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
    if (
      !(await GenerationJobManager.beginProviderExecution(
        streamId,
        job.createdAt,
        providerExecutionId,
      ))
    ) {
      throw Object.assign(new Error('Generation stopped before provider resume'), {
        code: 'RUN_REPLACED',
      });
    }
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

    // Keep the resume hand-off fence FRESH for the continuation's whole lifetime: the
    // claim-time stamp ages out on its staleness bound, so a continuation that runs
    // longer than that and then pauses AGAIN would re-enter `requires_action` with an
    // expired fence — quiesce could settle it while the re-pause writes were still
    // landing. Refreshed at half the staleness bound; cleared by the pause record or
    // aged out after a crash.
    let fenceRefresh = null;
    if (job.metadata?.scheduleId) {
      fenceRefresh = setInterval(
        () =>
          markScheduledRunResumeClaimed(
            job.metadata.scheduleId,
            new Date(job.metadata.scheduledFor),
          ).catch(() => undefined),
        5 * 60_000,
      );
      fenceRefresh.unref?.();
    }

    try {
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
    } finally {
      if (fenceRefresh) {
        clearInterval(fenceRefresh);
      }
    }

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
                // RETAIN a scheduled fire's failed re-pause error: this path settles
                // through the reconciler alone (the outer catch's pause branch records
                // no outcome), so evidence on the short completed TTL evaporates during
                // any longer outage and the run is misread as `interrupted`.
                job.metadata?.scheduleId
                  ? {
                      preserveForReconcile: true,
                      scheduleOutcome: {
                        status: 'error',
                        error: pausePersistenceError?.message ?? 'Re-pause persistence failed',
                      },
                    }
                  : undefined,
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
        // Move the scheduled run back to `requires_action`: it paused again, so it should
        // stop counting as active (started) for overlap/capacity, and this record is what
        // clears the resume-claimed hand-off stamp. Written while the pause barrier is
        // still HELD, so a deletion drain keeps deferring until this run-row write has
        // landed too. Never throws (it retries internally and reports failure as `false`),
        // so it cannot strand the barrier below.
        if (job.metadata?.scheduleId) {
          await recordScheduleOutcome({
            scheduleId: job.metadata.scheduleId,
            scheduledFor: job.metadata.scheduledFor,
            status: 'requires_action',
            conversationId,
          });
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
    // event and finalized the job — don't double-save / double-finalize here. The
    // scheduled RUN, though, is THIS controller's to settle: the route settles only
    // jobs it caught paused, and a resumed job is `running` at the abort CAS, so
    // returning without settling left the run active until the 30-minute reconciler
    // cutoff — blocking schedule and account deletion the whole time. Mirror the
    // request controller: settle after the route's persistence barrier, and FAIL
    // CLOSED (leave the run for the reconciler) when it cannot be confirmed.
    if (job.abortController.signal.aborted) {
      logger.debug(
        `[ResumeAgentController] Aborted during resume; abort route finalizes the job: ${streamId}`,
      );
      await settleAbortedScheduledResume(job, streamId, conversationId);
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
    // An abort is not a failure: abortJob already emitted the terminal event and
    // finalized the job, so the error flow below (emitError, completeJob, an `error`
    // outcome walking the failure streak) belongs only to genuine failures. A
    // resumed generation usually surfaces its abort as a THROW out of
    // resumeCompletion, so this classification — not the pre-finalize signal check —
    // is the path most stops actually take.
    //
    // The signal is authoritative; an abort-SHAPED error alone is not. A genuine
    // failure can mention 'abort' (driver errors like 'transaction aborted') with
    // nothing having finalized the job, and returning here then left it `running`
    // forever with no controller driving it. abortJob flips the job terminal BEFORE
    // any signal fires, so a job still running under this generation is proof no
    // abort finalized it — send that to the error path below instead.
    const abortShaped = err?.name === 'AbortError' || err?.message?.includes('abort');
    let wasAborted = job.abortController.signal.aborted;
    if (!wasAborted && abortShaped) {
      try {
        const liveJob = await GenerationJobManager.getJobStore().getJob(streamId);
        wasAborted = !(
          liveJob &&
          liveJob.createdAt === job.createdAt &&
          liveJob.status === 'running'
        );
      } catch (readErr) {
        logger.warn(
          '[ResumeAgentController] Abort classification read failed; treating as failure',
          readErr,
        );
      }
    }
    if (wasAborted) {
      logger.debug(`[ResumeAgentController] Resume aborted; settling the run: ${streamId}`);
      await settleAbortedScheduledResume(job, streamId, conversationId);
      return;
    }
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
      // Record the schedule error BEFORE the terminal CAS: for a scheduled fire that
      // paused and then failed on resume, this is the terminal point, and the job is
      // about to be deleted (the reconciler wouldn't see the error). If the write fails
      // (Mongo down across its retries), retain the completed job so reconcile records
      // the failure instead of the run lingering to the abandonment sweep.
      let scheduleOutcomeRecorded = true;
      let errorScheduleOutcome = null;
      if (job.metadata?.scheduleId) {
        // Same classification as the initial fire's catch: a mid-continuation
        // balance refusal is the OWNER's credits, not a schedule fault — it walks
        // the insufficient_balance streak, not too_many_failures.
        const balanceRefusal = isBalanceViolationError(err);
        errorScheduleOutcome = balanceRefusal
          ? { status: 'skipped_balance' }
          : { status: 'error', error: err?.message ?? 'Resume failed' };
        // EVIDENCE FIRST: a finalize that claimed `complete` stamped its outcome
        // BEFORE the response save that just threw, so the retained job still says
        // `success`. Refresh the stamp (job store — a different failure domain than
        // Mongo) before the outcome write below, so a reconciler recovering from that
        // write's failure reproduces the truthful classification.
        await GenerationJobManager.updateScheduleOutcome(
          streamId,
          job.createdAt,
          errorScheduleOutcome,
        );
        scheduleOutcomeRecorded = await recordScheduleOutcome({
          scheduleId: job.metadata.scheduleId,
          scheduledFor: job.metadata.scheduledFor,
          status: errorScheduleOutcome.status,
          conversationId: streamId,
          ...(errorScheduleOutcome.error != null && { error: errorScheduleOutcome.error }),
        });
      }
      // completeJob atomically claims running -> error and parks steers before
      // publishing. If abort or a re-pause won, it returns false; only the
      // terminal-CAS winner may delete this generation's checkpoint scope.
      let errorFinalized = false;
      // Fenced, same protocol as every other terminal CAS: registration failure skips
      // the transition and leaves the job visible to deletion (the stale reaper
      // recovers it). Cleared immediately after — the error path owes no
      // message-recreating writes past its CAS.
      const errorFenced = await GenerationJobManager.registerUserFinalization(
        userId,
        streamId,
        req.user?.tenantId,
        job.createdAt,
      )
        .then(() => true)
        .catch(() => false);
      if (!errorFenced) {
        logger.error(
          `[ResumeAgentController] Leaving ${streamId} unfinalized for the stale reaper — ` +
            'error terminal could not be fenced against account deletion',
        );
      } else {
        try {
          errorFinalized =
            (await GenerationJobManager.completeJob(
              streamId,
              err?.message ?? 'Resume failed',
              job.createdAt,
              {
                preserveForReconcile: Boolean(job.metadata?.scheduleId) && !scheduleOutcomeRecorded,
                // Ride the classification on the claim: a balance refusal claims an
                // `error` terminal but must walk the insufficient_balance streak.
                ...(errorScheduleOutcome != null && { scheduleOutcome: errorScheduleOutcome }),
              },
            )) === true;
        } catch (completeErr) {
          logger.error('[ResumeAgentController] Failed to finalize failed resume', completeErr);
        } finally {
          void GenerationJobManager.clearUserFinalization(
            userId,
            streamId,
            req.user?.tenantId,
            job.createdAt,
          ).catch(() => undefined);
        }
      }
      // completeJob early-returns on a job that is no longer `running` — the state a
      // schedule delete (or a retained terminal claim) leaves behind. The outcome above
      // makes the run terminal, so reconcile never rescans it and nothing else would ever
      // reap that job. Skipped when the outcome write failed: the job is then the only
      // reconcile evidence.
      if (job.metadata?.scheduleId && scheduleOutcomeRecorded) {
        await clearScheduledJob(streamId, {
          scheduleId: job.metadata.scheduleId,
          scheduledFor: job.metadata.scheduledFor,
        }).catch((clearErr) =>
          logger.warn('[ResumeAgentController] Failed to clear reconciled job', clearErr),
        );
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
    try {
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
    } finally {
      await GenerationJobManager.markProviderExecutionDrained?.(
        streamId,
        job.createdAt,
        providerExecutionId,
      ).catch((drainError) => {
        logger.warn('[ResumeAgentController] Failed to record provider drain', drainError);
      });
    }
  }
};

module.exports = ResumeAgentController;
