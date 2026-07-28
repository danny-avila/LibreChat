import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRecoilCallback, useSetRecoilState } from 'recoil';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TMessage, TConversation, Agents } from 'librechat-data-provider';
import type { ActiveJobsResponse, StreamStatusResponse } from '~/data-provider';
import type { PersistedResponseRefresh } from './recovery/messages';
import type { DisconnectedRunRecovery } from './resumableRecovery';
import type { RunRecoveryTarget } from './terminal';
import type { RunEnd } from '~/store/families';
import {
  clearDisconnectedRunRecovery,
  consumeTerminalEventSeen,
  disconnectedRunRecoveryQueryKey,
  getDisconnectedRunRecovery,
  getPendingRunReconciliations,
  getResumableRunEpoch,
  getResumableRunStarting,
  resumableRunStartingQueryKey,
  setDisconnectedRunRecovery,
  terminalRecoveryRequestQueryKey,
} from './resumableRecovery';
import {
  getPersistedRunState,
  getRunRecoveryTarget,
  getStatusRunOutcome,
  getUnreconciledAssistantTail,
  newConversationPath,
  recoveryOwnsCurrentRoute,
  submissionBelongsToConversation,
  withCurrentSearch,
} from './terminal';
import {
  addConversationToAllConversationsQueries,
  dedupeSteersById,
  removeConvoFromAllQueries,
} from '~/utils';
import { usePendingRunReconciliation, useRecoveryWakeup } from './recovery/usePending';
import { fetchStreamStatus, useActiveJobs } from '~/data-provider';
import { refreshPersistedResponse } from './recovery/messages';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { runTerminalRetry } from './recovery/retry';
import store from '~/store';

type RestoreSteerChips = (
  conversationId: string,
  pendingSteers: Agents.ResumeState['pendingSteers'],
) => void;

type UseTerminalRunRecoveryParams = {
  conversationId: string | undefined;
  getMessages: (conversationId?: string | null) => TMessage[] | undefined;
  restoreSteerChips: RestoreSteerChips;
  runIndex: number;
  enabled: boolean;
  messagesNotFound?: boolean;
};

export default function useTerminalRunRecovery({
  conversationId,
  getMessages,
  restoreSteerChips,
  runIndex,
  enabled,
  messagesNotFound = false,
}: UseTerminalRunRecoveryParams) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const setRunEnd = useSetRecoilState(store.runEndByIndex(runIndex));
  const setConversation = useSetRecoilState(store.conversationByIndex(runIndex));
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const convertSteersToQueued = useSteerConvert();
  const { data: activeJobsData } = useActiveJobs(enabled);
  const { data: isRunStarting = false } = useQuery({
    queryKey: resumableRunStartingQueryKey(conversationId ?? ''),
    queryFn: () => false,
    enabled: false,
    initialData: false,
    cacheTime: Infinity,
  });
  const { data: terminalRecoveryRequest = 0 } = useQuery({
    queryKey: terminalRecoveryRequestQueryKey(conversationId ?? ''),
    queryFn: () => 0,
    enabled: false,
    initialData: 0,
    cacheTime: Infinity,
  });
  const { data: disconnectedRunRecovery } = useQuery<DisconnectedRunRecovery | null>({
    queryKey: disconnectedRunRecoveryQueryKey(conversationId ?? ''),
    queryFn: () => null,
    enabled: false,
    cacheTime: Infinity,
  });
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
  const deferredTerminalRecoveryRef = useRef<string | null>(null);
  const observedTerminalRecoveryRequestRef = useRef<{
    conversationId?: string;
    request: number;
  }>({
    conversationId,
    request: terminalRecoveryRequest,
  });
  const publishedRunEndRef = useRef<{
    conversationId?: string;
    runEpoch: number;
    keys: Set<string>;
  }>({
    conversationId,
    runEpoch: getResumableRunEpoch(queryClient, conversationId ?? ''),
    keys: new Set(),
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      terminalRefreshAbortRef.current?.abort();
      terminalStatusAbortRef.current?.abort();
    };
  }, []);

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

  const getUnreconciledCurrentResponse = useCallback(() => {
    if (!conversationId) {
      return undefined;
    }

    const unreconciledResponse = getUnreconciledAssistantTail(getMessages(conversationId));
    if (!unreconciledResponse) {
      return undefined;
    }

    const belongsToPendingRecovery = getPendingRunReconciliations(queryClient, conversationId).some(
      (pendingRun) =>
        getPersistedRunState([unreconciledResponse], {
          userMessageId: pendingRun.userMessageId,
          responseMessageId: pendingRun.responseMessageId,
        }).responseFound,
    );
    return belongsToPendingRecovery ? undefined : unreconciledResponse;
  }, [conversationId, getMessages, queryClient]);

  const hasUnreconciledCurrentResponse = getUnreconciledCurrentResponse() != null;

  const ensureCurrentRecovery = useCallback((): DisconnectedRunRecovery | undefined => {
    if (!conversationId) {
      return undefined;
    }

    const existingRecovery = getDisconnectedRunRecovery(queryClient, conversationId);
    if (existingRecovery) {
      return existingRecovery;
    }

    const unreconciledResponse = getUnreconciledCurrentResponse();
    if (!unreconciledResponse) {
      return undefined;
    }

    const recovery = {
      startedAsNewConvo: false,
      created: true,
      userMessageId: unreconciledResponse.parentMessageId ?? undefined,
      responseMessageId: unreconciledResponse.messageId ?? undefined,
    };
    setDisconnectedRunRecovery(queryClient, conversationId, recovery);
    return recovery;
  }, [conversationId, getUnreconciledCurrentResponse, queryClient]);

  const publishRunEnd = useCallback(
    (runEnd: RunEnd, expectedRunEpoch: number) => {
      if (!conversationId) {
        return;
      }

      const observed = observedActiveJobRef.current;
      if (
        !mountedRef.current ||
        observed.conversationId !== conversationId ||
        observed.active ||
        getResumableRunEpoch(queryClient, conversationId) !== expectedRunEpoch
      ) {
        return;
      }

      if (
        publishedRunEndRef.current.conversationId !== conversationId ||
        publishedRunEndRef.current.runEpoch !== expectedRunEpoch
      ) {
        publishedRunEndRef.current = {
          conversationId,
          runEpoch: expectedRunEpoch,
          keys: new Set(),
        };
      }
      const publicationKey = [runEnd.conversationId, runEnd.outcome].join(':');
      if (publishedRunEndRef.current.keys.has(publicationKey)) {
        return;
      }

      publishedRunEndRef.current.keys.add(publicationKey);
      setRunEnd(runEnd);
    },
    [conversationId, queryClient, setRunEnd],
  );

  const rearmCompletedDrainForLateSteers = useRecoilCallback(
    ({ snapshot, set }) =>
      (terminalConversationId: string, expectedRunEpoch: number) => {
        const publishedRunEnd = publishedRunEndRef.current;
        if (
          !mountedRef.current ||
          getResumableRunEpoch(queryClient, terminalConversationId) !== expectedRunEpoch ||
          publishedRunEnd.conversationId !== terminalConversationId ||
          publishedRunEnd.runEpoch !== expectedRunEpoch ||
          !publishedRunEnd.keys.has(`${terminalConversationId}:completed`)
        ) {
          return;
        }

        const currentRunEnd = snapshot.getLoadable(store.runEndByIndex(runIndex)).getValue();
        if (currentRunEnd?.conversationId === terminalConversationId) {
          return;
        }
        const parkedRunEnd = snapshot
          .getLoadable(store.pendingRunEndByConvoId(terminalConversationId))
          .getValue();
        if (parkedRunEnd != null) {
          return;
        }

        set(store.pendingRunEndByConvoId(terminalConversationId), {
          conversationId: terminalConversationId,
          outcome: 'completed',
          endedAt: Date.now(),
        });
      },
    [queryClient, runIndex],
  );

  const refreshUnreconciledResponse = useCallback(
    async (
      expectedRunEpoch: number,
      recoveryTarget?: RunRecoveryTarget,
      forceRefresh = false,
    ): Promise<PersistedResponseRefresh> => {
      if (
        !conversationId ||
        getResumableRunEpoch(queryClient, conversationId) !== expectedRunEpoch
      ) {
        return {
          messages: undefined,
          succeeded: false,
          notFound: false,
          retryStatus: 'aborted',
        };
      }

      const unreconciledResponse = getUnreconciledAssistantTail(getMessages(conversationId));
      if (!forceRefresh && !unreconciledResponse && !recoveryTarget) {
        return {
          messages: getMessages(conversationId),
          succeeded: true,
          notFound: false,
          retryStatus: 'succeeded',
        };
      }

      const responseKey = [
        conversationId,
        recoveryTarget?.responseMessageId ?? unreconciledResponse?.messageId,
        recoveryTarget?.userMessageId ?? unreconciledResponse?.parentMessageId,
      ].join(':');
      if (refreshedResponseRef.current === responseKey) {
        return {
          messages: getMessages(conversationId),
          succeeded: false,
          notFound: false,
          retryStatus: 'aborted',
        };
      }

      terminalRefreshAbortRef.current?.abort();
      const refreshController = new AbortController();
      terminalRefreshAbortRef.current = refreshController;
      refreshedResponseRef.current = responseKey;
      console.log(
        '[TerminalRunRecovery] Completed job left an unreconciled response; refreshing messages:',
        conversationId,
      );

      const finish = (result: PersistedResponseRefresh): PersistedResponseRefresh => {
        if (refreshedResponseRef.current === responseKey) {
          refreshedResponseRef.current = null;
        }
        if (terminalRefreshAbortRef.current === refreshController) {
          terminalRefreshAbortRef.current = null;
        }
        return result;
      };

      const result = await refreshPersistedResponse({
        conversationId,
        getMessages: () => getMessages(conversationId),
        pathname: () => activePathnameRef.current ?? '',
        queryClient,
        recoveryTarget,
        acceptMissingResponse: true,
        forceRefresh,
        signal: refreshController.signal,
        canContinue: () => {
          const observed = observedActiveJobRef.current;
          return (
            mountedRef.current &&
            observed.conversationId === conversationId &&
            !observed.active &&
            getResumableRunEpoch(queryClient, conversationId) === expectedRunEpoch
          );
        },
      });
      return finish(result);
    },
    [conversationId, getMessages, queryClient],
  );

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
      refreshed: PersistedResponseRefresh,
      shouldSignalRunEnd: boolean,
      status?: StreamStatusResponse,
      recoveryTarget?: RunRecoveryTarget,
      recoveredSteers = false,
      expectedRunEpoch = 0,
      routeMessagesNotFound = false,
    ) => {
      if (!conversationId || !shouldSignalRunEnd) {
        return;
      }

      const observed = observedActiveJobRef.current;
      if (
        !mountedRef.current ||
        observed.conversationId !== conversationId ||
        observed.active ||
        getResumableRunEpoch(queryClient, conversationId) !== expectedRunEpoch
      ) {
        return;
      }

      const disconnectedRun = getDisconnectedRunRecovery(queryClient, conversationId);
      const isMissingRecoveryConversation =
        refreshed.notFound &&
        (disconnectedRun?.startedAsNewConvo === true ||
          disconnectedRun?.routeMessagesNotFound === true ||
          routeMessagesNotFound);
      const ownsRecoveryRoute = recoveryOwnsCurrentRoute(activePathnameRef.current, conversationId);

      if (isMissingRecoveryConversation) {
        removeConvoFromAllQueries(queryClient, conversationId);
        queryClient.removeQueries({
          queryKey: [QueryKeys.conversation, conversationId],
        });
        queryClient.removeQueries({
          queryKey: [QueryKeys.messages, conversationId],
        });
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, Constants.NEW_CONVO], []);
        if (ownsRecoveryRoute) {
          setConversation((current) =>
            current?.conversationId === conversationId
              ? {
                  ...current,
                  conversationId: String(Constants.NEW_CONVO),
                  title: 'New Chat',
                  createdAt: '',
                  updatedAt: '',
                }
              : current,
          );
          setSubmission((current) =>
            submissionBelongsToConversation(current, conversationId) ? null : current,
          );
        }
        publishRunEnd(
          {
            conversationId: String(Constants.NEW_CONVO),
            outcome: 'error',
            endedAt: Date.now(),
          },
          expectedRunEpoch,
        );
        clearDisconnectedRunRecovery(queryClient, conversationId);
        if (ownsRecoveryRoute) {
          navigate(withCurrentSearch(newConversationPath), { replace: true });
        }
        return;
      }

      const statusOutcome = status && getStatusRunOutcome(status);
      const canFinalizeWithoutMessages = statusOutcome === 'error' || statusOutcome === 'aborted';
      if (!refreshed.succeeded && !canFinalizeWithoutMessages) {
        return;
      }

      const persistedRun = getPersistedRunState(refreshed.messages, recoveryTarget);
      const outcome =
        statusOutcome ??
        persistedRun.outcome ??
        (recoveryTarget && persistedRun.userMessageFound && !persistedRun.responseFound
          ? 'error'
          : undefined) ??
        (!recoveryTarget && recoveredSteers ? 'aborted' : undefined);
      if (!outcome) {
        if (disconnectedRun?.routeMessagesNotFound === true && refreshed.succeeded) {
          clearDisconnectedRunRecovery(queryClient, conversationId);
        }
        return;
      }

      publishRunEnd(
        {
          conversationId,
          outcome,
          ...(disconnectedRun?.startedAsNewConvo && { startedAsNewConvo: true }),
          endedAt: Date.now(),
        },
        expectedRunEpoch,
      );
      clearDisconnectedRunRecovery(queryClient, conversationId);
      if (disconnectedRun?.startedAsNewConvo === true) {
        const recoveredConversation = queryClient.getQueryData<TConversation>([
          QueryKeys.conversation,
          conversationId,
        ]);
        if (recoveredConversation) {
          addConversationToAllConversationsQueries(queryClient, recoveredConversation);
        }
        if (!ownsRecoveryRoute) {
          return;
        }
        setConversation((current) => {
          if (
            current?.conversationId !== Constants.NEW_CONVO &&
            current?.conversationId !== conversationId
          ) {
            return current;
          }
          return {
            ...current,
            ...recoveredConversation,
            conversationId,
          } as TConversation;
        });
        navigate(withCurrentSearch(`/c/${conversationId}`), { replace: true });
      }
    },
    [conversationId, navigate, publishRunEnd, queryClient, setConversation, setSubmission],
  );

  const recoverInactiveResponse = useCallback(
    async (
      status: StreamStatusResponse,
      recoveredSteersOverride?: boolean,
      expectedRunEpoch?: number,
    ) => {
      if (!conversationId) {
        return;
      }

      const recoveryRunEpoch =
        expectedRunEpoch ?? getResumableRunEpoch(queryClient, conversationId);
      if (getResumableRunEpoch(queryClient, conversationId) !== recoveryRunEpoch) {
        return;
      }

      const recoveredSteers = recoveredSteersOverride ?? recoverStatusSteers(status);
      let disconnectedRun = ensureCurrentRecovery();
      if (!disconnectedRun && messagesNotFound) {
        disconnectedRun = {
          startedAsNewConvo: false,
          created: false,
          routeMessagesNotFound: true,
        };
        setDisconnectedRunRecovery(queryClient, conversationId, disconnectedRun);
      }
      const recoveryTarget = getRunRecoveryTarget(disconnectedRun, getMessages(conversationId));
      const statusOutcome = getStatusRunOutcome(status);
      const shouldSignalRunEnd =
        recoveryTarget != null || statusOutcome != null || recoveredSteers || messagesNotFound;

      restoreSteerChips(conversationId, undefined);
      const refreshPromise = refreshUnreconciledResponse(
        recoveryRunEpoch,
        recoveryTarget,
        messagesNotFound,
      );
      if (statusOutcome === 'error' || statusOutcome === 'aborted') {
        publishRunEnd(
          {
            conversationId,
            outcome: statusOutcome,
            ...(disconnectedRun?.startedAsNewConvo && { startedAsNewConvo: true }),
            endedAt: Date.now(),
          },
          recoveryRunEpoch,
        );
      }
      const refreshed = await refreshPromise;
      reconcileRefreshedResponse(
        refreshed,
        shouldSignalRunEnd,
        status,
        recoveryTarget,
        recoveredSteers,
        recoveryRunEpoch,
        messagesNotFound,
      );
    },
    [
      conversationId,
      ensureCurrentRecovery,
      getMessages,
      messagesNotFound,
      publishRunEnd,
      queryClient,
      reconcileRefreshedResponse,
      recoverStatusSteers,
      refreshUnreconciledResponse,
      restoreSteerChips,
    ],
  );

  const fetchTerminalStatus = useCallback(
    async (
      terminalConversationId: string,
      expectedRunEpoch: number,
    ): Promise<{ status: StreamStatusResponse; recoveredSteers: boolean } | undefined> => {
      terminalStatusAbortRef.current?.abort();
      const statusController = new AbortController();
      terminalStatusAbortRef.current = statusController;

      const finish = (result?: { status: StreamStatusResponse; recoveredSteers: boolean }) => {
        if (terminalStatusAbortRef.current === statusController) {
          terminalStatusAbortRef.current = null;
        }
        return result;
      };

      const result = await runTerminalRetry({
        signal: statusController.signal,
        operation: async (attemptSignal) => {
          // This endpoint atomically returns and deletes parked steers. The
          // request must finish even when its caller no longer needs status.
          const status = await fetchStreamStatus(terminalConversationId);
          const recoveredSteers = recoverStatusSteers(status);
          if (recoveredSteers && attemptSignal.aborted) {
            rearmCompletedDrainForLateSteers(terminalConversationId, expectedRunEpoch);
          }
          return {
            status,
            recoveredSteers,
          };
        },
        canContinue: () => {
          const observed = observedActiveJobRef.current;
          return (
            mountedRef.current &&
            observed.conversationId === terminalConversationId &&
            !observed.active
          );
        },
      });

      // Each request converts claimed steers inside the operation, including
      // late responses from an interrupted retry attempt.
      return finish(result.status === 'succeeded' ? result.value : undefined);
    },
    [rearmCompletedDrainForLateSteers, recoverStatusSteers],
  );

  usePendingRunReconciliation({
    conversationId,
    enabled,
    isCurrentJobActive,
    hasCurrentRecovery: disconnectedRunRecovery != null || hasUnreconciledCurrentResponse,
    isRunStarting,
    pathname: location.pathname,
    terminalRecoveryRequest,
    getMessages,
  });
  useRecoveryWakeup({ conversationId, enabled });

  useEffect(() => {
    const previous = observedActiveJobRef.current;
    observedActiveJobRef.current = {
      conversationId,
      active: isCurrentJobActive,
    };
    const previousRecoveryRequest = observedTerminalRecoveryRequestRef.current;
    const recoveryRequested =
      previousRecoveryRequest.conversationId === conversationId &&
      previousRecoveryRequest.request !== terminalRecoveryRequest;
    observedTerminalRecoveryRequestRef.current = {
      conversationId,
      request: terminalRecoveryRequest,
    };

    if (previous.conversationId !== conversationId) {
      deferredTerminalRecoveryRef.current = null;
      refreshedResponseRef.current = null;
      terminalStatusAbortRef.current?.abort();
      terminalRefreshAbortRef.current?.abort();
      return;
    }

    if (!previous.active && isCurrentJobActive) {
      deferredTerminalRecoveryRef.current = null;
      refreshedResponseRef.current = null;
      terminalStatusAbortRef.current?.abort();
      terminalRefreshAbortRef.current?.abort();
      return;
    }

    if (isCurrentJobActive) {
      return;
    }

    const runStarting = !!conversationId && getResumableRunStarting(queryClient, conversationId);
    const becameInactive = previous.active;
    const isDeferredRecovery =
      deferredTerminalRecoveryRef.current === conversationId && !runStarting;
    if (!becameInactive && !isDeferredRecovery && !recoveryRequested) {
      return;
    }

    if (runStarting) {
      deferredTerminalRecoveryRef.current = conversationId ?? null;
      return;
    }
    deferredTerminalRecoveryRef.current = null;

    if (!conversationId || consumeTerminalEventSeen(queryClient, conversationId)) {
      return;
    }

    const hasRecoveryState =
      hasUnreconciledCurrentResponse ||
      getDisconnectedRunRecovery(queryClient, conversationId) != null;
    if (!hasRecoveryState) {
      return;
    }
    ensureCurrentRecovery();

    const terminalConversationId = conversationId;
    const terminalRunEpoch = getResumableRunEpoch(queryClient, terminalConversationId);
    void fetchTerminalStatus(terminalConversationId, terminalRunEpoch).then((result) => {
      if (!result) {
        return;
      }
      const { status, recoveredSteers } = result;

      const observed = observedActiveJobRef.current;
      const sameRun =
        getResumableRunEpoch(queryClient, terminalConversationId) === terminalRunEpoch;
      if (status.active) {
        if (
          mountedRef.current &&
          sameRun &&
          observed.conversationId === terminalConversationId &&
          !observed.active
        ) {
          queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
            activeJobIds: [...new Set([...(old?.activeJobIds ?? []), terminalConversationId])],
          }));
        }
        return;
      }

      if (!mountedRef.current) {
        return;
      }
      if (getResumableRunStarting(queryClient, terminalConversationId)) {
        deferredTerminalRecoveryRef.current = terminalConversationId;
        return;
      }
      if (!sameRun || observed.conversationId !== terminalConversationId || observed.active) {
        return;
      }
      void recoverInactiveResponse(status, recoveredSteers, terminalRunEpoch);
    });
  }, [
    conversationId,
    ensureCurrentRecovery,
    fetchTerminalStatus,
    getMessages,
    hasUnreconciledCurrentResponse,
    isCurrentJobActive,
    isRunStarting,
    queryClient,
    recoverInactiveResponse,
    terminalRecoveryRequest,
  ]);

  return { recoverInactiveResponse };
}
