import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage, Agents } from 'librechat-data-provider';
import type { ActiveJobsResponse, StreamStatusResponse } from '~/data-provider';
import type { RunEnd } from '~/store/families';
import type { DisconnectedRunRecovery } from './resumableRecovery';
import { dedupeSteersById, isNotFoundError, removeConvoFromAllQueries } from '~/utils';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { fetchStreamStatus, useActiveJobs } from '~/data-provider';
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

type RestoreSteerChips = (
  conversationId: string,
  pendingSteers: Agents.ResumeState['pendingSteers'],
) => void;

type UseTerminalRunRecoveryParams = {
  conversationId: string | undefined;
  getMessages: () => TMessage[] | undefined;
  restoreSteerChips: RestoreSteerChips;
  runIndex: number;
  enabled: boolean;
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

export default function useTerminalRunRecovery({
  conversationId,
  getMessages,
  restoreSteerChips,
  runIndex,
  enabled,
}: UseTerminalRunRecoveryParams) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const setRunEnd = useSetRecoilState(store.runEndByIndex(runIndex));
  const convertSteersToQueued = useSteerConvert();
  const { data: activeJobsData } = useActiveJobs(enabled);
  const isCurrentJobActive =
    !!conversationId && (activeJobsData?.activeJobIds ?? []).includes(conversationId);
  const observedActiveJobRef = useRef<{ conversationId?: string; active: boolean }>({
    conversationId,
    active: isCurrentJobActive,
  });
  const activePathnameRef = useRef<string | null>(location.pathname);
  const refreshedResponseRef = useRef<string | null>(null);
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
      '[TerminalRunRecovery] Completed job left an unreconciled response; refreshing messages:',
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

    const finishSuccessfulRefresh = (): ResponseRefreshResult => {
      if (terminalRefreshAbortRef.current === refreshController) {
        terminalRefreshAbortRef.current = null;
      }
      return { messages: getMessages(), succeeded: true, notFound: false };
    };

    for (let attempt = 0; ; attempt++) {
      try {
        await queryClient.invalidateQueries(
          { queryKey: [QueryKeys.messages, conversationId] },
          { throwOnError: true },
        );
        if (refreshController.signal.aborted) {
          return finishFailedRefresh(false);
        }
        if (getUnreconciledAssistantTail(getMessages()) == null) {
          return finishSuccessfulRefresh();
        }
      } catch (error) {
        if (isNotFoundError(error)) {
          return finishFailedRefresh(true);
        }
        if (!isRetryableTerminalError(error)) {
          return finishFailedRefresh(false);
        }
      }

      const retryDelay = TERMINAL_RETRY_DELAYS[Math.min(attempt, TERMINAL_RETRY_DELAYS.length - 1)];
      if (!(await waitForRetryDelay(retryDelay, refreshController.signal))) {
        return finishFailedRefresh(false);
      }

      const observed = observedActiveJobRef.current;
      if (observed.conversationId !== conversationId || observed.active) {
        return finishFailedRefresh(false);
      }

      if (getUnreconciledAssistantTail(getMessages()) == null) {
        return finishSuccessfulRefresh();
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
        disconnectedRun?.startedAsNewConvo === true && refreshed.notFound;

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
    async (status: StreamStatusResponse, recoveredSteersOverride?: boolean) => {
      if (!conversationId) {
        return;
      }

      const recoveredSteers = recoveredSteersOverride ?? recoverStatusSteers(status);
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

      const finish = (status?: StreamStatusResponse) => {
        if (terminalStatusAbortRef.current === statusController) {
          terminalStatusAbortRef.current = null;
        }
        return status;
      };

      for (let attempt = 0; ; attempt++) {
        try {
          const status = await fetchStreamStatus(terminalConversationId);
          // The status route claims parked steers on read. Once a request has
          // succeeded, its payload must be processed even if a newer run
          // started while it was in flight; the caller gates all other work.
          return finish(status);
        } catch (error) {
          if (!isRetryableTerminalError(error)) {
            return finish();
          }
          const observed = observedActiveJobRef.current;
          if (
            observed.conversationId !== terminalConversationId ||
            observed.active ||
            statusController.signal.aborted
          ) {
            return finish();
          }

          const retryDelay =
            TERMINAL_RETRY_DELAYS[Math.min(attempt, TERMINAL_RETRY_DELAYS.length - 1)];
          if (!(await waitForRetryDelay(retryDelay, statusController.signal))) {
            return finish();
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

    if (!previous.active || isCurrentJobActive) {
      return;
    }

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

      // The status response may have atomically claimed parked steers. Recover
      // them even if a newer run became active before the request resolved.
      const recoveredSteers = recoverStatusSteers(status);
      if (observed.conversationId !== terminalConversationId || observed.active) {
        return;
      }
      void recoverInactiveResponse(status, recoveredSteers);
    });
  }, [
    conversationId,
    fetchTerminalStatus,
    getMessages,
    isCurrentJobActive,
    queryClient,
    recoverInactiveResponse,
    recoverStatusSteers,
  ]);

  return { recoverInactiveResponse };
}
