import type { QueryClient } from '@tanstack/react-query';

export type DisconnectedRunRecovery = {
  startedAsNewConvo: boolean;
  created: boolean;
  userMessageId?: string;
  responseMessageId?: string;
  terminalOutcome?: 'completed' | 'error' | 'aborted';
};

const terminalEventQueryKey = (conversationId: string) =>
  ['resumable-terminal-event', conversationId] as const;

const disconnectedRunQueryRoot = ['resumable-disconnected-run'] as const;

const disconnectedRunQueryKey = (conversationId: string) =>
  [...disconnectedRunQueryRoot, conversationId] as const;

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
