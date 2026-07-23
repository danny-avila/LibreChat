import type { QueryClient } from '@tanstack/react-query';

export type DisconnectedRunRecovery = {
  startedAsNewConvo: boolean;
  created: boolean;
};

const terminalEventQueryKey = (conversationId: string) =>
  ['resumable-terminal-event', conversationId] as const;

const disconnectedRunQueryKey = (conversationId: string) =>
  ['resumable-disconnected-run', conversationId] as const;

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
