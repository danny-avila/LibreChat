import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { PendingRunReconciliation } from '../resumableRecovery';
import {
  getDisconnectedRunRecovery,
  getPendingRunReconciliations,
  getResumableRunStarting,
  pendingRunReconciliationsQueryKey,
  removePendingRunReconciliation,
  requestTerminalRunRecovery,
} from '../resumableRecovery';
import { refreshPersistedResponse } from './messages';

type UsePendingRunReconciliationParams = {
  conversationId: string | undefined;
  enabled: boolean;
  isCurrentJobActive: boolean;
  isRunStarting: boolean;
  pathname: string;
  terminalRecoveryRequest: number;
  getMessages: (conversationId?: string | null) => TMessage[] | undefined;
};

export function usePendingRunReconciliation({
  conversationId,
  enabled,
  isCurrentJobActive,
  isRunStarting,
  pathname,
  terminalRecoveryRequest,
  getMessages,
}: UsePendingRunReconciliationParams) {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const activeTaskRef = useRef<string | null>(null);
  const { data: pendingRunReconciliations = [] } = useQuery<PendingRunReconciliation[]>({
    queryKey: pendingRunReconciliationsQueryKey(conversationId ?? ''),
    queryFn: () => [],
    enabled: false,
    initialData: [],
    cacheTime: Infinity,
  });

  useEffect(() => {
    if (
      !enabled ||
      !conversationId ||
      isCurrentJobActive ||
      isRunStarting ||
      pendingRunReconciliations.length === 0 ||
      activeTaskRef.current != null
    ) {
      return;
    }

    const task = pendingRunReconciliations[0];
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    activeTaskRef.current = task.taskId;

    void refreshPersistedResponse({
      conversationId,
      getMessages: () => getMessages(conversationId),
      pathname: () => pathname,
      queryClient,
      recoveryTarget: {
        userMessageId: task.userMessageId,
        responseMessageId: task.responseMessageId,
      },
      signal: controller.signal,
      canContinue: () =>
        !isCurrentJobActive && !getResumableRunStarting(queryClient, conversationId),
    })
      .then((refreshed) => {
        if (
          !controller.signal.aborted &&
          (refreshed.succeeded || refreshed.notFound || refreshed.retryStatus === 'failed')
        ) {
          removePendingRunReconciliation(queryClient, conversationId, task.taskId);
        }
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (activeTaskRef.current === task.taskId) {
          activeTaskRef.current = null;
        }
      });

    return () => {
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (activeTaskRef.current === task.taskId) {
        activeTaskRef.current = null;
      }
    };
  }, [
    conversationId,
    enabled,
    getMessages,
    isCurrentJobActive,
    isRunStarting,
    pathname,
    pendingRunReconciliations,
    queryClient,
    terminalRecoveryRequest,
  ]);
}

type UseRecoveryWakeupParams = {
  conversationId: string | undefined;
  enabled: boolean;
};

export function useRecoveryWakeup({ conversationId, enabled }: UseRecoveryWakeupParams) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !conversationId) {
      return;
    }

    const requestRecovery = () => {
      if (
        getDisconnectedRunRecovery(queryClient, conversationId) ||
        getPendingRunReconciliations(queryClient, conversationId).length > 0
      ) {
        requestTerminalRunRecovery(queryClient, conversationId);
      }
    };
    const requestVisibleRecovery = () => {
      if (document.visibilityState === 'visible') {
        requestRecovery();
      }
    };

    window.addEventListener('focus', requestRecovery);
    window.addEventListener('online', requestRecovery);
    document.addEventListener('visibilitychange', requestVisibleRecovery);
    return () => {
      window.removeEventListener('focus', requestRecovery);
      window.removeEventListener('online', requestRecovery);
      document.removeEventListener('visibilitychange', requestVisibleRecovery);
    };
  }, [conversationId, enabled, queryClient]);
}
