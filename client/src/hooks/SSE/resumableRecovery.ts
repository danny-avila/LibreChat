import type { QueryClient } from '@tanstack/react-query';

export type DisconnectedRunRecovery = {
  startedAsNewConvo: boolean;
  created: boolean;
  userMessageId?: string;
  responseMessageId?: string;
};

const terminalEventQueryKey = (conversationId: string) =>
  ['resumable-terminal-event', conversationId] as const;

const disconnectedRunQueryRoot = ['resumable-disconnected-run'] as const;
const runEpochQueryRoot = ['resumable-run-epoch'] as const;
const runStartingQueryRoot = ['resumable-run-starting'] as const;
const terminalRecoveryRequestQueryRoot = ['resumable-terminal-recovery-request'] as const;

const disconnectedRunQueryKey = (conversationId: string) =>
  [...disconnectedRunQueryRoot, conversationId] as const;

const runEpochQueryKey = (conversationId: string) =>
  [...runEpochQueryRoot, conversationId] as const;

export const resumableRunStartingQueryKey = (conversationId: string) =>
  [...runStartingQueryRoot, conversationId] as const;

export const terminalRecoveryRequestQueryKey = (conversationId: string) =>
  [...terminalRecoveryRequestQueryRoot, conversationId] as const;

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
  queryClient.setQueryData(disconnectedRunQueryKey(conversationId), recovery);
}

export function getDisconnectedRunRecovery(
  queryClient: QueryClient,
  conversationId: string,
): DisconnectedRunRecovery | undefined {
  return queryClient.getQueryData<DisconnectedRunRecovery>(disconnectedRunQueryKey(conversationId));
}

export function clearDisconnectedRunRecovery(queryClient: QueryClient, conversationId: string) {
  queryClient.removeQueries({
    queryKey: disconnectedRunQueryKey(conversationId),
    exact: true,
  });
}

export function clearResumableRecovery(queryClient: QueryClient, conversationId: string) {
  clearTerminalEventSeen(queryClient, conversationId);
  clearDisconnectedRunRecovery(queryClient, conversationId);
}
