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
  expectedTaskId?: string,
): number | false => {
  if (
    expectedTaskId != null &&
    !view?.messages.some(
      (message) =>
        message.messageId === `${expectedTaskId}:user` ||
        message.messageId === `${expectedTaskId}:assistant`,
    )
  ) {
    return now < readinessDeadline ? ACTIVE_THREAD_REFRESH_MS : false;
  }
  // During a rolling deploy, an older replica can return a thread-wide status
  // without the task-scoped activity projection. The exact assistant row is
  // nevertheless authoritative evidence that this selected invocation ended.
  if (
    expectedTaskId != null &&
    view?.activity == null &&
    view?.messages.some((message) => message.messageId === `${expectedTaskId}:assistant`)
  ) {
    return false;
  }
  if (view == null || view.status === 'dispatched') {
    return now < readinessDeadline ? ACTIVE_THREAD_REFRESH_MS : false;
  }
  return isTerminal(view.status) ? false : ACTIVE_THREAD_REFRESH_MS;
};

const responseStatus = (error: unknown): number | undefined => {
  if (error == null || typeof error !== 'object') return undefined;
  const candidate = error as { status?: number; response?: { status?: number } };
  return candidate.response?.status ?? candidate.status;
};

export const isSubagentReadinessPending = (
  error: unknown,
  readinessDeadline: number,
  now = Date.now(),
): boolean => responseStatus(error) === 404 && now < readinessDeadline;

export type SubagentThreadQueryResult = QueryObserverResult<SubagentThreadView> & {
  isReadinessPending: boolean;
};

export const useSubagentThreadQuery = (
  parentConversationId: string,
  threadId: string,
  taskId: string,
  config?: UseQueryOptions<SubagentThreadView>,
): SubagentThreadQueryResult => {
  const readinessKey = `${parentConversationId}\u0000${threadId}\u0000${taskId}`;
  const readiness = useMemo(
    () => ({ key: readinessKey, deadline: Date.now() + CHILD_READY_POLL_WINDOW_MS }),
    [readinessKey],
  );
  const query = useQuery<SubagentThreadView>(
    [QueryKeys.subagentThread, parentConversationId, threadId, taskId],
    () => dataService.getSubagentThread(parentConversationId, threadId, taskId),
    {
      enabled: parentConversationId !== '' && threadId !== '',
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: (view) =>
        subagentThreadRefetchInterval(view, readiness.deadline, Date.now(), taskId),
      ...config,
    },
  );

  return {
    ...query,
    isReadinessPending: isSubagentReadinessPending(query.error, readiness.deadline),
  };
};
