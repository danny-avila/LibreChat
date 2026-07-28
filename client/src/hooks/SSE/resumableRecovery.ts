import type { QueryClient } from '@tanstack/react-query';

export type DisconnectedRunRecovery = {
  startedAsNewConvo: boolean;
  created: boolean;
  userMessageId?: string;
  responseMessageId?: string;
  routeMessagesNotFound?: boolean;
};

export type PendingRunReconciliation = DisconnectedRunRecovery & {
  taskId: string;
  runEpoch: number;
};

const terminalEventQueryKey = (conversationId: string) =>
  ['resumable-terminal-event', conversationId] as const;

const disconnectedRunQueryRoot = ['resumable-disconnected-run'] as const;
const runEpochQueryRoot = ['resumable-run-epoch'] as const;
const runStartingQueryRoot = ['resumable-run-starting'] as const;
const terminalRecoveryRequestQueryRoot = ['resumable-terminal-recovery-request'] as const;
const pendingRunReconciliationQueryRoot = ['resumable-pending-run-reconciliation'] as const;

export const disconnectedRunRecoveryQueryKey = (conversationId: string) =>
  [...disconnectedRunQueryRoot, conversationId] as const;

const runEpochQueryKey = (conversationId: string) =>
  [...runEpochQueryRoot, conversationId] as const;

export const resumableRunStartingQueryKey = (conversationId: string) =>
  [...runStartingQueryRoot, conversationId] as const;

export const terminalRecoveryRequestQueryKey = (conversationId: string) =>
  [...terminalRecoveryRequestQueryRoot, conversationId] as const;

export const pendingRunReconciliationsQueryKey = (conversationId: string) =>
  [...pendingRunReconciliationQueryRoot, conversationId] as const;

export function markTerminalEventSeen(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueryData(terminalEventQueryKey(conversationId), true);
  clearDisconnectedRunRecovery(queryClient, conversationId);
}

export function consumeTerminalEventSeen(
  queryClient: QueryClient,
  conversationId: string,
): boolean {
  const queryKey = terminalEventQueryKey(conversationId);
  const seen = queryClient.getQueryData<boolean>(queryKey) === true;
  if (seen) {
    queryClient.removeQueries({ queryKey, exact: true });
  }
  return seen;
}

export function clearTerminalEventSeen(queryClient: QueryClient, conversationId: string) {
  queryClient.removeQueries({
    queryKey: terminalEventQueryKey(conversationId),
    exact: true,
  });
}

export function beginResumableRun(queryClient: QueryClient, conversationId: string): number {
  queryClient.setQueryDefaults(runEpochQueryRoot, { cacheTime: Infinity });
  const nextEpoch = getResumableRunEpoch(queryClient, conversationId) + 1;
  queryClient.setQueryData(runEpochQueryKey(conversationId), nextEpoch);
  return nextEpoch;
}

export function getResumableRunEpoch(queryClient: QueryClient, conversationId: string): number {
  return queryClient.getQueryData<number>(runEpochQueryKey(conversationId)) ?? 0;
}

export function setResumableRunStarting(
  queryClient: QueryClient,
  conversationId: string,
  starting: boolean,
) {
  queryClient.setQueryDefaults(runStartingQueryRoot, { cacheTime: Infinity });
  queryClient.setQueryData(resumableRunStartingQueryKey(conversationId), starting);
}

export function getResumableRunStarting(queryClient: QueryClient, conversationId: string): boolean {
  return queryClient.getQueryData<boolean>(resumableRunStartingQueryKey(conversationId)) === true;
}

export function requestTerminalRunRecovery(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueryDefaults(terminalRecoveryRequestQueryRoot, { cacheTime: Infinity });
  const queryKey = terminalRecoveryRequestQueryKey(conversationId);
  const nextRequest = (queryClient.getQueryData<number>(queryKey) ?? 0) + 1;
  queryClient.setQueryData(queryKey, nextRequest);
}

export function setDisconnectedRunRecovery(
  queryClient: QueryClient,
  conversationId: string,
  recovery: DisconnectedRunRecovery,
) {
  // This is session state, not fetched server data. It must survive the
  // default five-minute React Query GC while a disconnected job keeps running.
  queryClient.setQueryDefaults(disconnectedRunQueryRoot, { cacheTime: Infinity });
  queryClient.setQueryData(disconnectedRunRecoveryQueryKey(conversationId), recovery);
}

export function getDisconnectedRunRecovery(
  queryClient: QueryClient,
  conversationId: string,
): DisconnectedRunRecovery | undefined {
  return (
    queryClient.getQueryData<DisconnectedRunRecovery | null>(
      disconnectedRunRecoveryQueryKey(conversationId),
    ) ?? undefined
  );
}

export function clearDisconnectedRunRecovery(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueryDefaults(disconnectedRunQueryRoot, { cacheTime: Infinity });
  queryClient.setQueryData(disconnectedRunRecoveryQueryKey(conversationId), null);
}

function getPendingRunTaskId(recovery: DisconnectedRunRecovery, runEpoch: number): string {
  return [runEpoch, recovery.userMessageId ?? '', recovery.responseMessageId ?? ''].join(':');
}

export function getPendingRunReconciliations(
  queryClient: QueryClient,
  conversationId: string,
): PendingRunReconciliation[] {
  return (
    queryClient.getQueryData<PendingRunReconciliation[]>(
      pendingRunReconciliationsQueryKey(conversationId),
    ) ?? []
  );
}

export function queuePendingRunReconciliation(
  queryClient: QueryClient,
  conversationId: string,
  recovery: DisconnectedRunRecovery,
  runEpoch = getResumableRunEpoch(queryClient, conversationId),
): PendingRunReconciliation {
  queryClient.setQueryDefaults(pendingRunReconciliationQueryRoot, { cacheTime: Infinity });
  const task = {
    ...recovery,
    runEpoch,
    taskId: getPendingRunTaskId(recovery, runEpoch),
  };
  queryClient.setQueryData<PendingRunReconciliation[]>(
    pendingRunReconciliationsQueryKey(conversationId),
    (current = []) =>
      current.some((pending) => pending.taskId === task.taskId) ? current : [...current, task],
  );
  return task;
}

export function moveDisconnectedRunToPendingReconciliation(
  queryClient: QueryClient,
  conversationId: string,
): PendingRunReconciliation | undefined {
  const recovery = getDisconnectedRunRecovery(queryClient, conversationId);
  if (!recovery) {
    return undefined;
  }

  const task = queuePendingRunReconciliation(queryClient, conversationId, recovery);
  clearDisconnectedRunRecovery(queryClient, conversationId);
  return task;
}

export function removePendingRunReconciliation(
  queryClient: QueryClient,
  conversationId: string,
  taskId: string,
) {
  removePendingRunReconciliations(queryClient, conversationId, [taskId]);
}

export function removePendingRunReconciliations(
  queryClient: QueryClient,
  conversationId: string,
  taskIds: readonly string[],
) {
  const removedTaskIds = new Set(taskIds);
  const queryKey = pendingRunReconciliationsQueryKey(conversationId);
  queryClient.setQueryData<PendingRunReconciliation[]>(queryKey, (current = []) =>
    current.filter((task) => !removedTaskIds.has(task.taskId)),
  );
}

export function clearPendingRunReconciliations(queryClient: QueryClient, conversationId: string) {
  queryClient.removeQueries({
    queryKey: pendingRunReconciliationsQueryKey(conversationId),
    exact: true,
  });
}

export function clearResumableRecovery(queryClient: QueryClient, conversationId: string) {
  clearTerminalEventSeen(queryClient, conversationId);
  clearDisconnectedRunRecovery(queryClient, conversationId);
  clearPendingRunReconciliations(queryClient, conversationId);
}
