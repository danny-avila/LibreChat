import { useCallback, useEffect, useRef } from 'react';
import { useSetRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Constants,
  QueryKeys,
  tMessageSchema,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission, Agents } from 'librechat-data-provider';
import type { ActiveJobsResponse, StreamStatusResponse } from '~/data-provider';
import type { RunEnd } from '~/store/families';
import type { DisconnectedRunRecovery } from './resumableRecovery';
import {
  dedupeSteersById,
  applyPendingAction,
  carriedSteerContext,
  isNotFoundError,
  getBranchSiblingIndexesForTarget,
  removeConvoFromAllQueries,
} from '~/utils';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { fetchStreamStatus, useActiveJobs, useStreamStatus } from '~/data-provider';
import {
  clearDisconnectedRunRecovery,
  consumeTerminalEventSeen,
  getDisconnectedRunRecovery,
} from './resumableRecovery';
import store from '~/store';

type ResponseRefreshResult = {
  messages: TMessage[] | undefined;
  succeeded: boolean;
  notFound: boolean;
};

type RunRecoveryTarget = {
  userMessageId?: string;
  responseMessageId?: string;
};

type PersistedRunState = {
  outcome?: RunEnd['outcome'];
  responseFound: boolean;
  userMessageFound: boolean;
};

const TERMINAL_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] as const;

const waitForRetryDelay = (delay: number, signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    function cleanup() {
      signal.removeEventListener('abort', onAbort);
    }
    function onAbort() {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, delay);

    signal.addEventListener('abort', onAbort, { once: true });
  });

function isRetryableTerminalError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return true;
  }

  const candidate = error as {
    status?: number;
    response?: { status?: number };
  };
  const status = candidate.response?.status ?? candidate.status;
  return status == null || status === 408 || status === 429 || status >= 500;
}

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

function getUnreconciledAssistantTail(messages: TMessage[] | undefined): TMessage | undefined {
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage || lastMessage.isCreatedByUser === true) {
    return undefined;
  }

  const messageId = lastMessage.messageId ?? '';
  const isUnreconciled =
    lastMessage.createdAt == null || lastMessage.updatedAt == null || messageId.endsWith('_');

  return isUnreconciled ? lastMessage : undefined;
}

function getRunRecoveryTarget(
  disconnectedRun: DisconnectedRunRecovery | undefined,
  messages: TMessage[] | undefined,
): RunRecoveryTarget | undefined {
  const unreconciledResponse = getUnreconciledAssistantTail(messages);
  const userMessageId =
    disconnectedRun?.userMessageId ?? unreconciledResponse?.parentMessageId ?? undefined;
  const responseMessageId =
    disconnectedRun?.responseMessageId ?? unreconciledResponse?.messageId ?? undefined;

  if (!userMessageId && !responseMessageId) {
    return undefined;
  }

  return { userMessageId, responseMessageId };
}

function getMessageOutcome(message: TMessage): RunEnd['outcome'] | undefined {
  if (message.error === true) {
    return 'error';
  }
  if (message.unfinished === true) {
    return 'aborted';
  }
  if (
    message.createdAt == null ||
    message.updatedAt == null ||
    (message.messageId ?? '').endsWith('_')
  ) {
    return undefined;
  }
  return 'completed';
}

function getPersistedRunState(
  messages: TMessage[] | undefined,
  target: RunRecoveryTarget | undefined,
): PersistedRunState {
  if (!messages?.length || !target) {
    return { responseFound: false, userMessageFound: false };
  }

  const responseMessageId = target.responseMessageId;
  const unpaddedResponseMessageId = responseMessageId?.replace(/_+$/, '');
  const canUseParentFallback = !responseMessageId || responseMessageId.endsWith('_');
  let fallbackResponse: TMessage | undefined;
  let userMessageFound = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      target.userMessageId &&
      message.isCreatedByUser === true &&
      message.messageId === target.userMessageId
    ) {
      userMessageFound = true;
      continue;
    }
    if (message.isCreatedByUser === true) {
      continue;
    }
    if (
      responseMessageId &&
      (message.messageId === responseMessageId ||
        (!!unpaddedResponseMessageId && message.messageId === unpaddedResponseMessageId))
    ) {
      return {
        outcome: getMessageOutcome(message),
        responseFound: true,
        userMessageFound,
      };
    }
    if (
      !fallbackResponse &&
      canUseParentFallback &&
      target.userMessageId &&
      message.parentMessageId === target.userMessageId
    ) {
      fallbackResponse = message;
    }
  }

  return {
    outcome: fallbackResponse ? getMessageOutcome(fallbackResponse) : undefined,
    responseFound: fallbackResponse != null,
    userMessageFound,
  };
}

function getStatusRunOutcome(status: StreamStatusResponse): RunEnd['outcome'] | undefined {
  if (status.status === 'complete') {
    return 'completed';
  }
  if (status.status === 'error') {
    return 'error';
  }
  if (status.status === 'aborted') {
    return 'aborted';
  }
  return undefined;
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
): TSubmission {
  const userMessageData = resumeState.userMessage;
  const responseMessageId =
    resumeState.responseMessageId ?? `${userMessageData?.messageId ?? 'resume'}_`;

  // Try to find existing user message in the messages array (from database)
  const existingUserMessage = messages.find(
    (m) => m.isCreatedByUser && m.messageId === userMessageData?.messageId,
  );

  // Try to find existing response message in the messages array (from database)
  const existingResponseMessage = messages.find(
    (m) =>
      !m.isCreatedByUser &&
      (m.messageId === responseMessageId || m.parentMessageId === userMessageData?.messageId),
  );

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
  } as TSubmission & { resumeStreamId: string };
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
  const navigate = useNavigate();
  const location = useLocation();
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const setRunEnd = useSetRecoilState(store.runEndByIndex(runIndex));
  const currentSubmission = useRecoilValue(store.submissionByIndex(runIndex));
  const currentConversation = useRecoilValue(store.conversationByIndex(runIndex));
  const endpoint = currentConversation?.endpoint;
  const endpointType = currentConversation?.endpointType;
  const actualEndpoint = endpointType ?? endpoint;
  const resumableEnabled = !isAssistantsEndpoint(actualEndpoint);
  // Track conversations we've already processed (either resumed or skipped)
  const processedConvoRef = useRef<string | null>(null);
  const refreshedResponseRef = useRef<string | null>(null);
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
      (activeConversationId: string, pendingSteers: Agents.ResumeState['pendingSteers']) => {
        // Always reconcile against the server's still-queued list (mirrors the
        // sync-path re-seed in useResumableSSE): a steer applied while this
        // client was away is absent here (its inline part rides
        // aggregatedContent instead), so an EMPTY list must clear stale local
        // pending chips, not leave them stranded beside the applied part.
        set(store.pendingSteersByConvoId(activeConversationId), (prev) => {
          const chipById = new Map(prev.map((chip) => [chip.steerId, chip]));
          return [
            ...(pendingSteers ?? []).map((steer) => ({
              steerId: steer.steerId,
              text: steer.text,
              status: 'pending' as const,
              createdAt: steer.createdAt ?? Date.now(),
              ...(steer.files && steer.files.length > 0 && { files: steer.files }),
              ...carriedSteerContext(chipById.get(steer.steerId)),
            })),
            ...prev.filter((steer) => steer.status === 'failed'),
          ];
        });
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
  const { data: activeJobsData } = useActiveJobs(resumableEnabled);
  const isCurrentJobActive =
    !!conversationId && (activeJobsData?.activeJobIds ?? []).includes(conversationId);
  const observedActiveJobRef = useRef<{ conversationId?: string; active: boolean }>({
    conversationId,
    active: isCurrentJobActive,
  });
  const activePathnameRef = useRef<string | null>(location.pathname);
  const terminalRefreshAbortRef = useRef<AbortController | null>(null);
  const terminalStatusAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activePathnameRef.current = location.pathname;
    return () => {
      activePathnameRef.current = null;
      terminalRefreshAbortRef.current?.abort();
      terminalRefreshAbortRef.current = null;
      terminalStatusAbortRef.current?.abort();
      terminalStatusAbortRef.current = null;
    };
  }, [location.pathname]);

  const refreshUnreconciledResponse = useCallback(async (): Promise<ResponseRefreshResult> => {
    if (!conversationId) {
      return { messages: undefined, succeeded: false, notFound: false };
    }

    const unreconciledResponse = getUnreconciledAssistantTail(getMessages());
    if (!unreconciledResponse) {
      return { messages: getMessages(), succeeded: true, notFound: false };
    }

    const responseKey = [
      conversationId,
      unreconciledResponse.messageId,
      unreconciledResponse.updatedAt ?? '',
      unreconciledResponse.content?.length ?? 0,
    ].join(':');
    if (refreshedResponseRef.current === responseKey) {
      return { messages: getMessages(), succeeded: false, notFound: false };
    }

    terminalRefreshAbortRef.current?.abort();
    const refreshController = new AbortController();
    terminalRefreshAbortRef.current = refreshController;
    refreshedResponseRef.current = responseKey;
    console.log(
      '[ResumeOnLoad] Completed job left an unreconciled response; refreshing messages:',
      conversationId,
    );

    const finishFailedRefresh = (notFound: boolean): ResponseRefreshResult => {
      if (refreshedResponseRef.current === responseKey) {
        refreshedResponseRef.current = null;
      }
      if (terminalRefreshAbortRef.current === refreshController) {
        terminalRefreshAbortRef.current = null;
      }
      return {
        messages: getMessages(),
        succeeded: false,
        notFound,
      };
    };

    for (let attempt = 0; ; attempt++) {
      try {
        await queryClient.invalidateQueries(
          { queryKey: [QueryKeys.messages, conversationId] },
          { throwOnError: true },
        );
        if (terminalRefreshAbortRef.current === refreshController) {
          terminalRefreshAbortRef.current = null;
        }
        return { messages: getMessages(), succeeded: true, notFound: false };
      } catch (error) {
        if (isNotFoundError(error)) {
          return finishFailedRefresh(true);
        }
        if (!isRetryableTerminalError(error)) {
          return finishFailedRefresh(false);
        }

        const retryDelay =
          TERMINAL_RETRY_DELAYS[Math.min(attempt, TERMINAL_RETRY_DELAYS.length - 1)];
        if (!(await waitForRetryDelay(retryDelay, refreshController.signal))) {
          return finishFailedRefresh(false);
        }

        const observed = observedActiveJobRef.current;
        if (observed.conversationId !== conversationId || observed.active) {
          return finishFailedRefresh(false);
        }

        if (getUnreconciledAssistantTail(getMessages()) == null) {
          if (terminalRefreshAbortRef.current === refreshController) {
            terminalRefreshAbortRef.current = null;
          }
          return { messages: getMessages(), succeeded: true, notFound: false };
        }
      }
    }
  }, [conversationId, getMessages, queryClient]);

  const recoverStatusSteers = useCallback(
    (status: StreamStatusResponse) => {
      if (!conversationId || status.active) {
        return false;
      }

      const leftoverSteers = dedupeSteersById(
        status.unrecoveredSteers,
        status.resumeState?.pendingSteers,
      );
      if (leftoverSteers.length > 0) {
        convertSteersToQueued(conversationId, leftoverSteers);
      }
      return leftoverSteers.length > 0;
    },
    [conversationId, convertSteersToQueued],
  );

  const reconcileRefreshedResponse = useCallback(
    (
      refreshed: ResponseRefreshResult,
      shouldSignalRunEnd: boolean,
      status?: StreamStatusResponse,
      recoveryTarget?: RunRecoveryTarget,
      recoveredSteers = false,
    ) => {
      if (!conversationId || !shouldSignalRunEnd) {
        return;
      }

      const observed = observedActiveJobRef.current;
      if (observed.conversationId !== conversationId || observed.active) {
        return;
      }

      const disconnectedRun = getDisconnectedRunRecovery(queryClient, conversationId);
      const isUnpersistedFirstTurn =
        disconnectedRun?.startedAsNewConvo === true &&
        disconnectedRun.created === false &&
        refreshed.notFound;

      if (isUnpersistedFirstTurn) {
        removeConvoFromAllQueries(queryClient, conversationId);
        queryClient.removeQueries({
          queryKey: [QueryKeys.conversation, conversationId],
        });
        queryClient.removeQueries({
          queryKey: [QueryKeys.messages, conversationId],
        });
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
        setRunEnd({
          conversationId: String(Constants.NEW_CONVO),
          outcome: 'error',
          endedAt: Date.now(),
        });
        clearDisconnectedRunRecovery(queryClient, conversationId);
        if (activePathnameRef.current === `/c/${conversationId}`) {
          navigate(`/c/${Constants.NEW_CONVO}`, { replace: true });
        }
        return;
      }

      if (!refreshed.succeeded) {
        return;
      }

      const persistedRun = getPersistedRunState(refreshed.messages, recoveryTarget);
      const outcome =
        disconnectedRun?.terminalOutcome ??
        (status && getStatusRunOutcome(status)) ??
        persistedRun.outcome ??
        (recoveryTarget && persistedRun.userMessageFound && !persistedRun.responseFound
          ? 'error'
          : undefined) ??
        (!recoveryTarget && recoveredSteers ? 'aborted' : undefined);
      if (!outcome) {
        return;
      }

      setRunEnd({
        conversationId,
        outcome,
        ...(disconnectedRun?.startedAsNewConvo && { startedAsNewConvo: true }),
        endedAt: Date.now(),
      });
      clearDisconnectedRunRecovery(queryClient, conversationId);
    },
    [conversationId, navigate, queryClient, setRunEnd],
  );

  const recoverInactiveResponse = useCallback(
    async (
      status: StreamStatusResponse,
      options?: {
        steersRecovered?: boolean;
        recoveredSteers?: boolean;
      },
    ) => {
      if (!conversationId) {
        return;
      }

      const recoveredSteers =
        options?.steersRecovered === true
          ? options.recoveredSteers === true
          : recoverStatusSteers(status);
      const disconnectedRun = getDisconnectedRunRecovery(queryClient, conversationId);
      const recoveryTarget = getRunRecoveryTarget(disconnectedRun, getMessages());
      const shouldSignalRunEnd =
        recoveryTarget != null ||
        disconnectedRun?.terminalOutcome != null ||
        getStatusRunOutcome(status) != null ||
        recoveredSteers;

      restoreSteerChips(conversationId, undefined);
      const refreshed = await refreshUnreconciledResponse();
      reconcileRefreshedResponse(
        refreshed,
        shouldSignalRunEnd,
        status,
        recoveryTarget,
        recoveredSteers,
      );
    },
    [
      conversationId,
      getMessages,
      queryClient,
      reconcileRefreshedResponse,
      recoverStatusSteers,
      refreshUnreconciledResponse,
      restoreSteerChips,
    ],
  );

  const fetchTerminalStatus = useCallback(
    async (terminalConversationId: string): Promise<StreamStatusResponse | undefined> => {
      terminalStatusAbortRef.current?.abort();
      const statusController = new AbortController();
      terminalStatusAbortRef.current = statusController;

      for (let attempt = 0; ; attempt++) {
        try {
          const status = await fetchStreamStatus(terminalConversationId);
          if (terminalStatusAbortRef.current === statusController) {
            terminalStatusAbortRef.current = null;
          }
          return status;
        } catch (error) {
          if (!isRetryableTerminalError(error)) {
            return undefined;
          }
          const observed = observedActiveJobRef.current;
          if (
            observed.conversationId !== terminalConversationId ||
            observed.active ||
            statusController.signal.aborted
          ) {
            return undefined;
          }

          const retryDelay =
            TERMINAL_RETRY_DELAYS[Math.min(attempt, TERMINAL_RETRY_DELAYS.length - 1)];
          if (!(await waitForRetryDelay(retryDelay, statusController.signal))) {
            return undefined;
          }
        }
      }
    },
    [],
  );

  useEffect(() => {
    const previous = observedActiveJobRef.current;
    observedActiveJobRef.current = {
      conversationId,
      active: isCurrentJobActive,
    };

    if (previous.conversationId !== conversationId) {
      refreshedResponseRef.current = null;
      terminalStatusAbortRef.current?.abort();
      return;
    }

    if (!previous.active && isCurrentJobActive) {
      refreshedResponseRef.current = null;
      terminalStatusAbortRef.current?.abort();
      terminalRefreshAbortRef.current?.abort();
      return;
    }

    if (previous.active && !isCurrentJobActive) {
      if (!conversationId || consumeTerminalEventSeen(queryClient, conversationId)) {
        return;
      }

      const hasRecoveryState =
        getUnreconciledAssistantTail(getMessages()) != null ||
        getDisconnectedRunRecovery(queryClient, conversationId) != null;
      if (!hasRecoveryState) {
        return;
      }

      const terminalConversationId = conversationId;
      void fetchTerminalStatus(terminalConversationId).then((status) => {
        if (!status) {
          return;
        }

        const observed = observedActiveJobRef.current;
        if (status.active) {
          if (observed.conversationId === terminalConversationId && !observed.active) {
            queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
              activeJobIds: [...new Set([...(old?.activeJobIds ?? []), terminalConversationId])],
            }));
          }
          return;
        }

        // This response may already have atomically claimed parked steers.
        // Recover them before checking whether a newer run became active.
        const recoveredSteers = recoverStatusSteers(status);
        if (observed.conversationId !== terminalConversationId || observed.active) {
          return;
        }
        void recoverInactiveResponse(status, {
          steersRecovered: true,
          recoveredSteers,
        });
      });
    }
  }, [
    conversationId,
    fetchTerminalStatus,
    getMessages,
    isCurrentJobActive,
    queryClient,
    recoverInactiveResponse,
    recoverStatusSteers,
  ]);

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
      void recoverInactiveResponse(streamStatus);
      processedConvoRef.current = conversationId;
      return;
    }

    processedConvoRef.current = conversationId;

    console.log('[ResumeOnLoad] Found active job, creating submission...', {
      streamId: streamStatus.streamId,
      status: streamStatus.status,
      resumeState: streamStatus.resumeState,
    });

    const messages = getMessages() || [];

    // Build submission from resume state if available
    if (streamStatus.resumeState) {
      restoreResumeBranch(streamStatus.resumeState, messages, conversationId);
      restoreSteerChips(conversationId, streamStatus.resumeState.pendingSteers);
      const submission = buildSubmissionFromResumeState(
        streamStatus.resumeState,
        streamStatus.streamId,
        messages,
        conversationId,
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
      } as TSubmission & { resumeStreamId: string };
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
    recoverInactiveResponse,
    restoreResumeBranch,
    restoreSteerChips,
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
    }
  }, [conversationId]);
}
