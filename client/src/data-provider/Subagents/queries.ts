import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { SubagentThreadView } from 'librechat-data-provider';

const ACTIVE_THREAD_REFRESH_MS = 2_000;
const CHILD_READY_POLL_WINDOW_MS = 60_000;

const isTerminal = (status: SubagentThreadView['status']): boolean =>
  status === 'completed' ||
  status === 'failed' ||
  status === 'interrupted' ||
  status === 'cancelled';

export const subagentThreadRefetchInterval = (
  view: SubagentThreadView | undefined,
  readinessDeadline: number,
  now = Date.now(),
): number | false => {
  if (view == null || view.status === 'dispatched') {
    return now < readinessDeadline ? ACTIVE_THREAD_REFRESH_MS : false;
  }
  return isTerminal(view.status) ? false : ACTIVE_THREAD_REFRESH_MS;
};

export const useSubagentThreadQuery = (
  parentConversationId: string,
  threadId: string,
  config?: UseQueryOptions<SubagentThreadView>,
): QueryObserverResult<SubagentThreadView> => {
  const readinessKey = `${parentConversationId}\u0000${threadId}`;
  const readiness = useMemo(
    () => ({ key: readinessKey, deadline: Date.now() + CHILD_READY_POLL_WINDOW_MS }),
    [readinessKey],
  );
  return useQuery<SubagentThreadView>(
    [QueryKeys.subagentThread, parentConversationId, threadId],
    () => dataService.getSubagentThread(parentConversationId, threadId),
    {
      enabled: parentConversationId !== '' && threadId !== '',
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: (view) => subagentThreadRefetchInterval(view, readiness.deadline),
      ...config,
    },
  );
};
