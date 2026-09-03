import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import {
  Constants,
  QueryKeys,
  tMessageSchema,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission, Agents } from 'librechat-data-provider';
import type { GenerationProtocolVersion } from '~/data-provider/SSE/protocol';
import type { StreamStatusResponse } from '~/data-provider';
import {
  dedupeSteersById,
  appendAppliedSteerIds,
  collectAppliedSteerIds,
  collectDroppedSteerQuotes,
  mergeRestagedQuotes,
  applyPendingAction,
  carriedSteerContext,
  getBranchSiblingIndexesForTarget,
} from '~/utils';
import {
  useStreamStatus,
  useActiveJobs,
  useAgentQueuedTurns,
  streamStatusQueryKey,
  isQueuedTurnSuccessorOwed,
  ACTIVE_JOBS_SUCCESSOR_GRACE_MS,
} from '~/data-provider';
import {
  getGenerationProtocolVersion,
  supportsGenerationProtocolV2,
} from '~/data-provider/SSE/protocol';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import store from '~/store';

/**
 * Matches the active-job list's own poll interval: answering an announcement
 * faster than the list can change it would only re-read the same snapshot.
 */
const ACTIVE_JOB_REARM_INTERVAL_MS = 5_000;

function hasSubmissionUserMessage(
  submission: TSubmission | null,
  messages: TMessage[] | undefined,
  conversationId: string | undefined,
): boolean {
  const userMessageId = submission?.userMessage?.messageId;
  if (!userMessageId || !conversationId || !messages?.length) {
    return false;
  }

  return messages.some(
    (message) =>
      message.isCreatedByUser === true &&
      message.messageId === userMessageId &&
      message.conversationId === conversationId,
  );
}

function resumeStateMatchesSubmission(
  streamStatus: StreamStatusResponse | undefined,
  submission: TSubmission | null,
): boolean {
  const resumeState = streamStatus?.resumeState;
  if (!resumeState || !submission) {
    return false;
  }

  const userMessageId = submission.userMessage?.messageId;
  if (userMessageId && resumeState.userMessage?.messageId === userMessageId) {
    return true;
  }

  const responseMessageId = submission.initialResponse?.messageId;
  return !!responseMessageId && resumeState.responseMessageId === responseMessageId;
}

function getResumeBranchTargetMessageId(
  resumeState: Agents.ResumeState,
  messages: TMessage[],
): string | null | undefined {
  const responseMessageId = resumeState.responseMessageId;
  if (!responseMessageId) {
    return resumeState.userMessage?.parentMessageId;
  }

  const unpaddedResponseMessageId = responseMessageId.replace(/_+$/, '');
  let hasResponseMessage = false;
  let hasUnpaddedResponseMessage = false;

  for (const message of messages) {
    if (message.messageId === responseMessageId) {
      hasResponseMessage = true;
      break;
    }

    if (message.messageId === unpaddedResponseMessageId) {
      hasUnpaddedResponseMessage = true;
    }
  }

  if (hasResponseMessage) {
    return responseMessageId;
  }

  if (hasUnpaddedResponseMessage) {
    return unpaddedResponseMessageId;
  }

  return resumeState.userMessage?.parentMessageId;
}

function preferDefinedString(value?: string | null, fallback?: string): string | undefined {
  return value != null && value !== '' ? value : fallback;
}

/**
 * Build a submission object from resume state for reconnected streams.
 * This provides the minimum data needed for useResumableSSE to subscribe.
 */
function buildSubmissionFromResumeState(
  resumeState: Agents.ResumeState,
  streamId: string,
  messages: TMessage[],
  conversationId: string,
  generationCreatedAt?: number,
  generationProtocolVersion: GenerationProtocolVersion = 1,
): TSubmission {
  const userMessageData = resumeState.userMessage;
  const responseMessageId =
    resumeState.responseMessageId ?? `${userMessageData?.messageId ?? 'resume'}_`;

  // Try to find existing user message in the messages array (from database)
  const existingUserMessage = messages.find(
    (m) => m.isCreatedByUser && m.messageId === userMessageData?.messageId,
  );

  // A trailing underscore distinguishes an in-flight regeneration from the persisted
  // response it replaces. Only the exact response id proves generation ownership.
  const existingResponseMessage = messages.find(
    (m) => !m.isCreatedByUser && m.messageId === responseMessageId,
  );
  // The persisted row may seed display metadata, but never identity or deduplication.
  const unpaddedResponseMessageId = responseMessageId.replace(/_+$/, '');
  const persistedRegenerationResponse =
    unpaddedResponseMessageId !== responseMessageId
      ? messages.find((m) => !m.isCreatedByUser && m.messageId === unpaddedResponseMessageId)
      : undefined;
  const responseMetadataMessage = existingResponseMessage ?? persistedRegenerationResponse;
  const isRegenerateResume =
    resumeState.isRegenerate === true || persistedRegenerationResponse != null;
  let regenerateMessages: TMessage[] | undefined;
  if (isRegenerateResume) {
    regenerateMessages =
      unpaddedResponseMessageId === responseMessageId
        ? [...messages]
        : messages.filter((message) => message.messageId !== responseMessageId);
  }

  // Create or use existing user message
  const userMessage: TMessage =
    existingUserMessage ??
    (userMessageData
      ? (tMessageSchema.parse({
          messageId: userMessageData.messageId,
          parentMessageId: userMessageData.parentMessageId ?? Constants.NO_PARENT,
          conversationId: userMessageData.conversationId ?? conversationId,
          text: userMessageData.text ?? '',
          isCreatedByUser: true,
          role: 'user',
        }) as TMessage)
      : (messages[messages.length - 2] ??
        ({
          messageId: 'resume_user_msg',
          conversationId,
          text: '',
          isCreatedByUser: true,
        } as TMessage)));

  // ALWAYS use aggregatedContent from resumeState - it has the latest content from the running job.
  // DB content may be stale (saved at disconnect, but generation continued).
  let initialResponse: TMessage = {
    messageId: existingResponseMessage?.messageId ?? responseMessageId,
    parentMessageId: existingResponseMessage?.parentMessageId ?? userMessage.messageId,
    conversationId,
    text: '',
    // aggregatedContent is authoritative - it reflects actual job state
    content: (resumeState.aggregatedContent as TMessage['content']) ?? [],
    isCreatedByUser: false,
    role: 'assistant',
    sender: responseMetadataMessage?.sender ?? resumeState.sender,
    model: preferDefinedString(responseMetadataMessage?.model, resumeState.model),
    iconURL: preferDefinedString(responseMetadataMessage?.iconURL, resumeState.iconURL),
  } as TMessage;

  // Re-paused turn: seed the approval / ask-user controls straight onto the
  // placeholder so they render on load without waiting for the SSE sync replay.
  if (resumeState.pendingAction) {
    initialResponse = applyPendingAction(initialResponse, resumeState.pendingAction);
  }

  const conversation: TConversation = {
    conversationId,
    title: 'Resumed Chat',
    endpoint: null,
  } as TConversation;

  // Non-regenerate resumes strip the persisted request/response pair before handlers
  // re-supply it. A regeneration keeps the original branch for early-abort rollback;
  // explicit resume metadata covers edited regenerations that reuse the exact response id.
  const dedupedMessages = messages.filter(
    (m) =>
      m.messageId !== initialResponse.messageId &&
      (isRegenerateResume || m.messageId !== userMessage.messageId),
  );

  return {
    messages: dedupedMessages,
    userMessage,
    initialResponse,
    conversation,
    isRegenerate: isRegenerateResume,
    ...(regenerateMessages && { regenerateMessages }),
    isTemporary: false,
    endpointOption: {},
    // Signal to useResumableSSE to subscribe to existing stream instead of starting new
    resumeStreamId: streamId,
    ...(generationCreatedAt != null && { resumeGenerationCreatedAt: generationCreatedAt }),
    resumeGenerationProtocolVersion: generationProtocolVersion,
  } as TSubmission & {
    resumeStreamId: string;
    resumeGenerationCreatedAt?: number;
    resumeGenerationProtocolVersion: GenerationProtocolVersion;
  };
}

/**
 * Hook to resume streaming if navigating to a conversation with active generation.
 * Checks stream status via React Query and sets submission if active job found.
 *
 * This hook:
 * 1. Uses useStreamStatus to check for active jobs on navigation
 * 2. If active job found, builds a submission with streamId and sets it
 * 3. useResumableSSE picks up the submission and subscribes to the stream
 *
 * @param messagesLoaded - Whether the messages query has finished loading (prevents race condition)
 */
export default function useResumeOnLoad(
  conversationId: string | undefined,
  getMessages: () => TMessage[] | undefined,
  runIndex = 0,
  messagesLoaded = true,
) {
  const queryClient = useQueryClient();
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const setSubmissionStart = useSetRecoilState(store.submissionStartFamily(runIndex));
  const currentSubmission = useRecoilValue(store.submissionByIndex(runIndex));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(runIndex));
  const attachedGenerationCreatedAt = useRecoilValue(
    store.activeGenerationCreatedAtByConvoId(conversationId ?? ''),
  );
  const currentConversation = useRecoilValue(store.conversationByIndex(runIndex));
  const endpoint = currentConversation?.endpoint;
  const endpointType = currentConversation?.endpointType;
  const actualEndpoint = endpointType ?? endpoint;
  const resumableEnabled = !isAssistantsEndpoint(actualEndpoint);
  // Track conversations we've already processed (either resumed or skipped)
  const processedConvoRef = useRef<string | null>(null);
  /**
   * When this pane last answered an active-job announcement, per conversation.
   * A job stays listed for its whole lifetime, so the announcement cannot be
   * consumed once and latched: two external runs back to back leave the list
   * reading `[conversationId]` continuously, and a latch keyed on observing it
   * empty would never release. Rate-limit to the list's own heartbeat instead —
   * repeatable, and still one status read per interval at worst.
   */
  const answeredActiveJobRef = useRef<{ conversationId: string; at: number } | null>(null);
  /**
   * Bumped when an announcement is answered. Clearing `processedConvoRef` alone
   * cannot restart the check below: a ref mutation neither schedules a render
   * nor re-runs an effect, so the arm has to be a value the effect depends on.
   */
  const [externalRunArm, setExternalRunArm] = useState(0);
  /** `generationHandoff` lives in the React Query snapshot until a later
   * status refetch. Remember the exact epoch already consumed so clearing the
   * replacement submission on FINAL cannot re-install that stale snapshot and
   * enter a resume→404→resume loop. A genuinely newer handoff has a different
   * createdAt key and remains eligible. */
  const consumedHandoffGenerationRef = useRef<string | null>(null);
  const restoreResumeBranch = useRecoilCallback(
    ({ set }) =>
      (resumeState: Agents.ResumeState, messages: TMessage[], activeConversationId: string) => {
        const targetMessageId = getResumeBranchTargetMessageId(resumeState, messages);
        const branchIndexes = getBranchSiblingIndexesForTarget(
          messages,
          targetMessageId,
          activeConversationId,
        );

        for (const { parentMessageId, siblingIdx } of branchIndexes) {
          set(store.messagesSiblingIdxFamily(parentMessageId), siblingIdx);
        }
      },
    [],
  );

  /** Restore pending-steer chips for steers the server still has queued
   *  (injected ones already live inside the resumed aggregatedContent). */
  const convertSteersToQueued = useSteerConvert();

  const restoreSteerChips = useRecoilCallback(
    ({ set }) =>
      (
        activeConversationId: string,
        pendingSteers: Agents.ResumeState['pendingSteers'],
        generationCreatedAt?: number,
        generationProtocolVersion: GenerationProtocolVersion = 1,
      ) => {
        const acceptedClientIds = (pendingSteers ?? []).flatMap((steer) =>
          steer.clientSteerId ? [steer.clientSteerId] : [],
        );
        if (acceptedClientIds.length > 0) {
          set(store.acceptedSteerClientIdsByConvoId(activeConversationId), (prev) =>
            appendAppliedSteerIds(prev, acceptedClientIds),
          );
        }
        // Always reconcile against the server's still-queued list (mirrors the
        // sync-path re-seed in useResumableSSE): a steer applied while this
        // client was away is absent here (its inline part rides
        // aggregatedContent instead), so an EMPTY list must clear stale local
        // pending chips, not leave them stranded beside the applied part.
        set(store.pendingSteersByConvoId(activeConversationId), (prev) => {
          const chipById = new Map(prev.map((chip) => [chip.steerId, chip]));
          const claimedIds = new Set(
            (pendingSteers ?? []).flatMap((steer) =>
              steer.clientSteerId ? [steer.steerId, steer.clientSteerId] : [steer.steerId],
            ),
          );
          return [
            ...(pendingSteers ?? []).map((steer) => {
              const localChip =
                chipById.get(steer.steerId) ??
                (steer.clientSteerId ? chipById.get(steer.clientSteerId) : undefined);
              const keepLocalPreempt =
                (localChip?.preemptRevision ?? 0) > (steer.preemptRevision ?? 0);
              const chipGenerationCreatedAt = generationCreatedAt ?? localChip?.generationCreatedAt;
              return {
                steerId: steer.steerId,
                ...(steer.clientSteerId && { clientSteerId: steer.clientSteerId }),
                text: steer.text,
                status: 'pending' as const,
                createdAt: steer.createdAt ?? Date.now(),
                ...(steer.files && steer.files.length > 0 && { files: steer.files }),
                ...((keepLocalPreempt ? localChip?.preempt : steer.preempt) === true && {
                  preempt: true,
                }),
                ...((keepLocalPreempt ? localChip?.preemptRevision : steer.preemptRevision) !=
                  null && {
                  preemptRevision: keepLocalPreempt
                    ? localChip?.preemptRevision
                    : steer.preemptRevision,
                }),
                ...(localChip?.queuedOrigin && { queuedOrigin: localChip.queuedOrigin }),
                ...(chipGenerationCreatedAt != null && {
                  generationCreatedAt: chipGenerationCreatedAt,
                }),
                generationProtocolVersion,
                // The local chip carries skill picks the server never sees; a
                // fresh tab has no chip, so fall back to the server item's
                // persisted quotes rather than reseeding the chip without them.
                ...carriedSteerContext(localChip ?? steer),
              };
            }),
            ...prev.filter((steer) => steer.status === 'failed' && !claimedIds.has(steer.steerId)),
          ];
        });
      },
    [],
  );

  const settleAppliedSteerParts = useRecoilCallback(
    ({ snapshot, set }) =>
      (activeConversationId: string, values: unknown[] | undefined) => {
        const ids = collectAppliedSteerIds(values);
        if (ids.length === 0) {
          return;
        }
        const settled = new Set(ids);
        /** Chips settled by quote-less applied parts hold the only copy of
         *  their excerpts (a pre-quotes server injected the words bare) —
         *  re-stage them as composer chips before the removal below. */
        const droppedQuotes = collectDroppedSteerQuotes(
          values,
          snapshot.getLoadable(store.pendingSteersByConvoId(activeConversationId)).getValue(),
        );
        if (droppedQuotes.length > 0) {
          set(store.pendingQuotesByConvoId(activeConversationId), (prev) =>
            mergeRestagedQuotes(prev, droppedQuotes),
          );
        }
        set(store.appliedSteerIdsByConvoId(activeConversationId), (prev) =>
          appendAppliedSteerIds(prev, ids),
        );
        set(store.pendingSteersByConvoId(activeConversationId), (prev) =>
          prev.filter((steer) => !settled.has(steer.steerId)),
        );
      },
    [],
  );
  const setActiveGenerationCreatedAt = useRecoilCallback(
    ({ set }) =>
      (
        activeConversationId: string,
        createdAt: number,
        generationProtocolVersion: GenerationProtocolVersion,
      ) => {
        set(store.activeGenerationCreatedAtByConvoId(activeConversationId), createdAt);
        set(
          store.activeGenerationProtocolVersionByConvoId(activeConversationId),
          generationProtocolVersion,
        );
      },
    [],
  );

  // Check for active stream when conversation changes
  const submissionConvoId = currentSubmission?.conversation?.conversationId;
  const loadedMessages = messagesLoaded ? getMessages() : undefined;
  const hasExplicitSubmissionMatch = !!conversationId && submissionConvoId === conversationId;
  const hasHydratedMessageMatch =
    submissionConvoId == null &&
    hasSubmissionUserMessage(currentSubmission, loadedMessages, conversationId);
  const hasActiveSubmissionForThisConvo =
    !!currentSubmission && (hasExplicitSubmissionMatch || hasHydratedMessageMatch);
  const hasStaleSubmissionForDifferentConvo =
    !!currentSubmission && submissionConvoId != null && submissionConvoId !== conversationId;
  /**
   * A submission only stands in for an attachment while one is actually live.
   * The FINAL path never clears the atom, so a pane that just finished a run
   * keeps holding the submission it completed — bookkeeping, not a stream.
   *
   * Two signals, because neither covers the whole lifetime on its own.
   * `isSubmitting` is raised by `ask` before a submission is installed and held
   * across reconnect backoff, so sends and recovery both read as attached. It
   * is not raised for a resumed attachment until that stream opens, though, and
   * this effect installs the submission well before then — so an announcement
   * landing in that window would tear down the attachment it had just built.
   * The generation epoch closes it: this hook stamps it immediately before
   * installing a resume submission, `subscribeToStream` stamps it for every
   * other attachment, and terminal teardown is what clears it.
   */
  const hasLiveSubmissionForThisConvo =
    hasActiveSubmissionForThisConvo && (isSubmitting || attachedGenerationCreatedAt != null);

  /**
   * A run this pane did not start — another tab, another device, a scheduled
   * trigger — announces itself only through the user-scoped active-job list,
   * which already polls while anything is running and refetches on focus. The
   * status query is the one thing that could turn that into an attachment, and
   * it switches off for the rest of this conversation's mount the moment it has
   * answered inactive once. Without a re-arm the pane sits on history it cannot
   * see has moved on, and a send from here forks a branch off a stale tail.
   *
   * Consumed once per run rather than held open: a job stays listed for its
   * whole lifetime, and re-opening the query on every poll would turn a
   * five-second heartbeat into a five-second status read.
   */
  /**
   * `dataUpdatedAt` is the trigger, not `activeJobsData`. React Query keeps the
   * previous reference when a refetch is deep-equal, and a run that stays
   * listed produces exactly that — so the derived boolean below never changes
   * and an effect keyed on it would run once and never again. The stamp moves
   * on every fetch, which is the heartbeat this needs.
   */
  /**
   * Positive evidence that the backend owes this conversation a run: a queued
   * turn it has taken ownership of. The client never builds a submission for
   * one — `useQueueDrain` declines the boundary — so the resulting run has to
   * be recognised from the active-job list, and finishing the previous run is
   * what empties that list. Saying so outright keeps the listening exact
   * instead of betting on how long admission takes.
   *
   * Read from the server's own receipts rather than the chip projection, so
   * admission semantics stay beside the queue's own predicate instead of being
   * restated here. `useSteering` owns the fetch; subscribing with
   * `enabled: false` observes that cache without competing for it, and an
   * unpopulated cache simply falls back to the handover window.
   */
  const { data: queuedTurnReceipts, dataUpdatedAt: queuedTurnsUpdatedAt } = useAgentQueuedTurns(
    conversationId ?? '',
    false,
  );
  const successorOwedByReceipt = isQueuedTurnSuccessorOwed(queuedTurnReceipts);
  /**
   * The receipt cannot carry the handover on its own. It reports `admitted` for
   * one fetch at most and is then dropped from the projection — before the
   * active-job list has necessarily observed the run it started — so a pane
   * keyed on the receipt alone would stop listening in the one window that
   * matters. Once a successor is known to be owed, hold that until it is
   * delivered: this pane attaches, or the list names the conversation. A
   * bounded expiry backstops the case where neither ever happens (the run
   * came and went inside one poll, or admission failed elsewhere), and starts
   * only once the receipt has gone quiet, so a long wait behind an unadmitted
   * turn does not burn the window before the handover begins.
   */
  const [owedSuccessorFor, setOwedSuccessorFor] = useState<string | null>(null);
  const successorOwed =
    !hasLiveSubmissionForThisConvo &&
    (successorOwedByReceipt || (conversationId != null && owedSuccessorFor === conversationId));
  const { data: activeJobsData, dataUpdatedAt: activeJobsUpdatedAt } = useActiveJobs(
    resumableEnabled,
    successorOwed,
  );
  const hasActiveJobForThisConvo =
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    activeJobsData?.activeJobIds?.includes(conversationId) === true;
  const successorDelivered = hasLiveSubmissionForThisConvo || hasActiveJobForThisConvo;

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    if (successorDelivered) {
      setOwedSuccessorFor((current) => (current === conversationId ? null : current));
      return;
    }
    if (successorOwedByReceipt) {
      setOwedSuccessorFor(conversationId);
    }
  }, [conversationId, successorOwedByReceipt, successorDelivered]);

  useEffect(() => {
    if (conversationId == null || owedSuccessorFor !== conversationId || successorOwedByReceipt) {
      return;
    }
    const expiry = setTimeout(() => {
      setOwedSuccessorFor((current) => (current === conversationId ? null : current));
    }, ACTIVE_JOBS_SUCCESSOR_GRACE_MS);
    return () => clearTimeout(expiry);
  }, [conversationId, owedSuccessorFor, successorOwedByReceipt]);

  const shouldCheck =
    resumableEnabled &&
    messagesLoaded && // Wait for messages to load before checking
    !hasActiveSubmissionForThisConvo && // Allow if no submission or a confirmed stale submission
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    processedConvoRef.current !== conversationId; // Don't re-check processed convos

  const {
    data: streamStatus,
    dataUpdatedAt: streamStatusUpdatedAt,
    isSuccess,
    isFetching,
  } = useStreamStatus(conversationId, shouldCheck);

  useEffect(() => {
    console.log('[ResumeOnLoad] Effect check', {
      resumableEnabled,
      conversationId,
      messagesLoaded,
      hasCurrentSubmission: !!currentSubmission,
      currentSubmissionConvoId: currentSubmission?.conversation?.conversationId,
      isSuccess,
      isFetching,
      streamStatusActive: streamStatus?.active,
      streamStatusStreamId: streamStatus?.streamId,
      processedConvoRef: processedConvoRef.current,
    });

    if (!resumableEnabled || !conversationId || conversationId === Constants.NEW_CONVO) {
      console.log('[ResumeOnLoad] Skipping - not enabled or new convo');
      return;
    }

    // Wait for messages to load to avoid race condition where sync overwrites then DB overwrites
    if (!messagesLoaded) {
      console.log('[ResumeOnLoad] Waiting for messages to load');
      return;
    }

    // Don't resume if we already have an active submission FOR THIS CONVERSATION
    // A stale submission with undefined/different conversationId should not block us
    if (hasActiveSubmissionForThisConvo) {
      console.log('[ResumeOnLoad] Skipping - already have active submission for this conversation');
      // Mark as processed so we don't try again
      processedConvoRef.current = conversationId;
      return;
    }

    // If there's a stale submission for a different conversation, log it but continue
    if (hasStaleSubmissionForDifferentConvo) {
      console.log(
        '[ResumeOnLoad] Found stale submission for different conversation, will check for resume',
        {
          staleConvoId: submissionConvoId,
          currentConvoId: conversationId,
        },
      );
    }

    // Wait for stream status query to complete (including background refetches
    // that may replace a stale cached result with fresh data)
    if (!isSuccess || !streamStatus || isFetching) {
      console.log('[ResumeOnLoad] Waiting for stream status query');
      return;
    }

    /** useResumableSSE detected that this conversation-scoped stream now
     * belongs to a newer generation. It cleared the stale submission and
     * cached the replacement snapshot; allow the same conversation to be
     * processed again so this epoch becomes the active resume submission. */
    const generationProtocolVersion = getGenerationProtocolVersion(streamStatus);
    const isGenerationProtocolV2 = supportsGenerationProtocolV2(streamStatus);
    const handoffGenerationKey =
      isGenerationProtocolV2 &&
      streamStatus.generationHandoff === true &&
      streamStatus.createdAt != null
        ? `${conversationId}:${streamStatus.createdAt}`
        : null;
    if (
      currentSubmission == null &&
      handoffGenerationKey != null &&
      consumedHandoffGenerationRef.current !== handoffGenerationKey &&
      streamStatus.active &&
      processedConvoRef.current === conversationId
    ) {
      processedConvoRef.current = null;
    }

    if (
      streamStatus.active &&
      streamStatus.streamId &&
      submissionConvoId == null &&
      resumeStateMatchesSubmission(streamStatus, currentSubmission)
    ) {
      console.log('[ResumeOnLoad] Skipping - active submission matches stream status', {
        streamId: streamStatus.streamId,
        currentConvoId: conversationId,
        userMessageId: currentSubmission?.userMessage?.messageId,
      });
      processedConvoRef.current = conversationId;
      return;
    }

    // Don't process the same conversation twice
    if (processedConvoRef.current === conversationId) {
      console.log('[ResumeOnLoad] Skipping - already processed this conversation');
      return;
    }

    if (!streamStatus.active || !streamStatus.streamId) {
      console.log('[ResumeOnLoad] No active job to resume for:', conversationId);
      // A terminal drain may have parked acknowledged steers no subscriber
      // received (tab closed / reload racing the final event) — the status
      // claim returns them exactly once; restore as queued follow-up chips.
      // An expired pendingAction can report inactive BEFORE the sweeper parks
      // the steer queue: those steers still ride resumeState.pendingSteers,
      // so convert both lists (id-deduped) before the empty seed clears chips.
      const leftoverSteers = dedupeSteersById(
        streamStatus.unrecoveredSteers,
        streamStatus.resumeState?.pendingSteers,
      );
      if (conversationId && leftoverSteers.length > 0) {
        convertSteersToQueued(conversationId, leftoverSteers, {
          generationProtocolVersion,
        });
      }
      // The run is terminal, so any remaining local pending chip is stale:
      // its steer either applied (inline part in the saved message) or rode
      // `unrecoveredSteers` above — same empty-list reconcile as the resume path.
      settleAppliedSteerParts(conversationId, getMessages());
      restoreSteerChips(conversationId, undefined);
      processedConvoRef.current = conversationId;
      return;
    }

    processedConvoRef.current = conversationId;
    if (handoffGenerationKey != null) {
      consumedHandoffGenerationRef.current = handoffGenerationKey;
    }
    if (streamStatus.createdAt != null) {
      setActiveGenerationCreatedAt(
        conversationId,
        streamStatus.createdAt,
        generationProtocolVersion,
      );
    }

    console.log('[ResumeOnLoad] Found active job, creating submission...', {
      streamId: streamStatus.streamId,
      status: streamStatus.status,
      resumeState: streamStatus.resumeState,
    });

    const messages = getMessages() || [];
    /** Fill the elapsed baseline only when none survives: a reattach to the run
     *  this session already anchored keeps its original start (the atom outlives
     *  the submission). A run it never anchored — after a reload, or started by
     *  another client — rebuilds the real baseline from the server-computed
     *  generation age, which keeps both clocks comparing only to themselves.
     *  The age is subtracted from the moment the status RESPONSE arrived
     *  (`dataUpdatedAt`), not from now: this effect trails the response behind
     *  `messagesLoaded`, and a slow history fetch would silently shrink the
     *  reading. Raw `createdAt` (an older server) still beats counting from
     *  attach; the indicator clamps whatever skew that carries. */
    setSubmissionStart((prev) => {
      if (prev != null) {
        return prev;
      }
      if (streamStatus.elapsedMs != null) {
        return (streamStatusUpdatedAt || Date.now()) - streamStatus.elapsedMs;
      }
      return streamStatus.createdAt ?? Date.now();
    });

    // Build submission from resume state if available
    if (streamStatus.resumeState) {
      restoreResumeBranch(streamStatus.resumeState, messages, conversationId);
      restoreSteerChips(
        conversationId,
        streamStatus.resumeState.pendingSteers,
        streamStatus.createdAt,
        generationProtocolVersion,
      );
      // Restore the server's pending snapshot before settling inline steer
      // parts. A steer present in both views was applied during the snapshot
      // boundary and must finish absent, never resurrected as a chip.
      settleAppliedSteerParts(conversationId, [
        ...messages,
        ...(streamStatus.resumeState.aggregatedContent ?? []),
      ]);
      const submission = buildSubmissionFromResumeState(
        streamStatus.resumeState,
        streamStatus.streamId,
        messages,
        conversationId,
        streamStatus.createdAt,
        generationProtocolVersion,
      );
      setSubmission(submission);
    } else {
      // Minimal submission without resume state
      const lastUserMessage = [...messages].reverse().find((m) => m.isCreatedByUser);
      const submission = {
        messages,
        userMessage:
          lastUserMessage ?? ({ messageId: 'resume', conversationId, text: '' } as TMessage),
        initialResponse: {
          messageId: 'resume_',
          conversationId,
          text: '',
          content: streamStatus.aggregatedContent ?? [{ type: 'text', text: '' }],
        } as TMessage,
        conversation: { conversationId, title: 'Resumed Chat' } as TConversation,
        isRegenerate: false,
        isTemporary: false,
        endpointOption: {},
        // Signal to useResumableSSE to subscribe to existing stream instead of starting new
        resumeStreamId: streamStatus.streamId,
        ...(streamStatus.createdAt != null && {
          resumeGenerationCreatedAt: streamStatus.createdAt,
        }),
        resumeGenerationProtocolVersion: generationProtocolVersion,
      } as TSubmission & {
        resumeStreamId: string;
        resumeGenerationCreatedAt?: number;
        resumeGenerationProtocolVersion: GenerationProtocolVersion;
      };
      setSubmission(submission);
    }
  }, [
    conversationId,
    resumableEnabled,
    messagesLoaded,
    hasActiveSubmissionForThisConvo,
    submissionConvoId,
    hasStaleSubmissionForDifferentConvo,
    currentSubmission,
    isSuccess,
    isFetching,
    streamStatus,
    streamStatusUpdatedAt,
    getMessages,
    setSubmission,
    setSubmissionStart,
    restoreResumeBranch,
    restoreSteerChips,
    settleAppliedSteerParts,
    convertSteersToQueued,
    setActiveGenerationCreatedAt,
    externalRunArm,
  ]);

  // Reset processedConvoRef when conversation changes to allow re-checking
  useEffect(() => {
    // Always reset when conversation changes - this allows resuming when navigating back
    if (conversationId !== processedConvoRef.current) {
      console.log('[ResumeOnLoad] Resetting processedConvoRef for new conversation:', {
        old: processedConvoRef.current,
        new: conversationId,
      });
      processedConvoRef.current = null;
      consumedHandoffGenerationRef.current = null;
      answeredActiveJobRef.current = null;
    }
  }, [conversationId]);

  /**
   * Answer an active-job announcement for the conversation on screen.
   *
   * The announcement means "your history may have moved", not merely "re-open
   * the status query", so both reads this pane is about to make are forced
   * fresh first. Toggling `enabled` alone would not do it: an inactive status
   * answered less than `staleTime` ago is still fresh, and React Query would
   * hand back that cached "nothing running" and let the effect above record the
   * announcement as handled without ever attaching.
   *
   * History is invalidated for the same reason, and it matters whichever way
   * the status read lands. An external client may have completed whole turns
   * this pane never saw before starting the one now running: the resume
   * submission and `finalHandler` both build on this snapshot, so attaching
   * without it grafts the live turn onto a hole. And when the run turns out to
   * have already finished, the refetch is the entire repair — the messages
   * query disables refetch on focus, mount and reconnect, so nothing else would
   * ever collect those turns. The refetch also re-gates `messagesLoaded`, which
   * defers the effect above until the authoritative history has landed.
   */
  /**
   * Two announcement sources, one arm. The active-job list is the general one.
   * An owed queued turn is the specific one, and it must be able to arm on its
   * own: the run it announces can start and finish between two list polls, and
   * the status read this arm enables is the authoritative answer either way —
   * active attaches, inactive means the history refetch below is the repair.
   */
  const successorAnnounced = hasActiveJobForThisConvo || successorOwed;
  useEffect(() => {
    if (!successorAnnounced) {
      answeredActiveJobRef.current = null;
      return;
    }
    if (!resumableEnabled || !conversationId || hasLiveSubmissionForThisConvo) {
      return;
    }

    const answered = answeredActiveJobRef.current;
    const now = Date.now();
    if (
      answered != null &&
      answered.conversationId === conversationId &&
      now - answered.at < ACTIVE_JOB_REARM_INTERVAL_MS
    ) {
      return;
    }
    answeredActiveJobRef.current = { conversationId, at: now };

    console.log('[ResumeOnLoad] Active job announced without an attachment', { conversationId });
    /**
     * A finished submission still installed here is the one thing standing
     * between this announcement and the attachment: it is what the check below
     * reads as "already attached", and what disables the status query. The run
     * it describes is over, so release it — a server-side continuation such as
     * a background tool dispatch finishing is a different generation, and the
     * resume path is what owns building the submission for it.
     */
    if (hasActiveSubmissionForThisConvo) {
      setSubmission(null);
    }
    queryClient.invalidateQueries({ queryKey: streamStatusQueryKey(conversationId) });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.messages, conversationId] });
    processedConvoRef.current = null;
    setExternalRunArm((arm) => arm + 1);
  }, [
    conversationId,
    resumableEnabled,
    successorAnnounced,
    hasActiveSubmissionForThisConvo,
    hasLiveSubmissionForThisConvo,
    attachedGenerationCreatedAt,
    activeJobsUpdatedAt,
    queuedTurnsUpdatedAt,
    setSubmission,
    queryClient,
  ]);
}
