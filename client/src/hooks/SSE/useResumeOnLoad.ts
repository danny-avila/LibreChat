import { useEffect, useRef } from 'react';
import { useSetRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import { Constants, tMessageSchema, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission, Agents } from 'librechat-data-provider';
import type { GenerationProtocolVersion } from '~/data-provider/SSE/protocol';
import type { StreamStatusResponse } from '~/data-provider';
import {
  dedupeSteersById,
  appendAppliedSteerIds,
  collectAppliedSteerIds,
  applyPendingAction,
  carriedSteerContext,
  getBranchSiblingIndexesForTarget,
} from '~/utils';
import {
  getGenerationProtocolVersion,
  supportsGenerationProtocolV2,
} from '~/data-provider/SSE/protocol';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { useStreamStatus } from '~/data-provider';
import store from '~/store';

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

  // Try to find existing response message in the messages array (from database).
  // Regeneration can expose the in-flight placeholder id with trailing underscores
  // while the persisted sibling uses the unpadded id. Prefer both exact identities
  // before falling back to the shared parent, where several branch siblings can match.
  const unpaddedResponseMessageId = responseMessageId.replace(/_+$/, '');
  const existingResponseMessage =
    messages.find((m) => !m.isCreatedByUser && m.messageId === responseMessageId) ??
    messages.find((m) => !m.isCreatedByUser && m.messageId === unpaddedResponseMessageId) ??
    messages.find((m) => !m.isCreatedByUser && m.parentMessageId === userMessageData?.messageId);

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
    sender: existingResponseMessage?.sender ?? resumeState.sender,
    model: preferDefinedString(existingResponseMessage?.model, resumeState.model),
    iconURL: preferDefinedString(existingResponseMessage?.iconURL, resumeState.iconURL),
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

  // On reload, `messages` is the full DB array, which already holds the paused user
  // row and the partial (unfinished) assistant row under the same ids that
  // `userMessage` / `initialResponse` (and the resume final event's request/response
  // messages) re-supply. Strip them so createdHandler/finalHandler — which build
  // `[...messages, requestMessage, responseMessage]` — don't append a duplicate pair.
  const pausedResponseIdUnpadded = initialResponse.messageId.replace(/_+$/, '');
  const dedupedMessages = messages.filter(
    (m) =>
      m.messageId !== userMessage.messageId &&
      m.messageId !== initialResponse.messageId &&
      m.messageId !== pausedResponseIdUnpadded,
  );

  return {
    messages: dedupedMessages,
    userMessage,
    initialResponse,
    conversation,
    isRegenerate: false,
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
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const currentSubmission = useRecoilValue(store.submissionByIndex(runIndex));
  const currentConversation = useRecoilValue(store.conversationByIndex(runIndex));
  const endpoint = currentConversation?.endpoint;
  const endpointType = currentConversation?.endpointType;
  const actualEndpoint = endpointType ?? endpoint;
  const resumableEnabled = !isAssistantsEndpoint(actualEndpoint);
  // Track conversations we've already processed (either resumed or skipped)
  const processedConvoRef = useRef<string | null>(null);
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
                ...carriedSteerContext(localChip),
              };
            }),
            ...prev.filter((steer) => steer.status === 'failed' && !claimedIds.has(steer.steerId)),
          ];
        });
      },
    [],
  );

  const settleAppliedSteerParts = useRecoilCallback(
    ({ set }) =>
      (activeConversationId: string, values: unknown[] | undefined) => {
        const ids = collectAppliedSteerIds(values);
        if (ids.length === 0) {
          return;
        }
        const settled = new Set(ids);
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

  const shouldCheck =
    resumableEnabled &&
    messagesLoaded && // Wait for messages to load before checking
    !hasActiveSubmissionForThisConvo && // Allow if no submission or a confirmed stale submission
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    processedConvoRef.current !== conversationId; // Don't re-check processed convos

  const {
    data: streamStatus,
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
    getMessages,
    setSubmission,
    restoreResumeBranch,
    restoreSteerChips,
    settleAppliedSteerParts,
    convertSteersToQueued,
    setActiveGenerationCreatedAt,
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
    }
  }, [conversationId]);
}
