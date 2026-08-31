import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import type {
  TAgentQueuedTurnReceipt,
  TEnqueueAgentQueuedTurnRequest,
} from 'librechat-data-provider';

export type AgentQueuedTurnReceipt = TAgentQueuedTurnReceipt;
export type EnqueueAgentQueuedTurnRequest = TEnqueueAgentQueuedTurnRequest;

export const agentQueuedTurnsQueryKey = (
  conversationId: string,
  clientRequestIds: readonly string[] = [],
) => [QueryKeys.agentQueuedTurns, conversationId, ...clientRequestIds] as const;

function queuedTurnErrorResponse(error: unknown): { status?: number; code?: string } {
  const response = (
    error as { response?: { status?: unknown; data?: { code?: unknown } } } | undefined
  )?.response;
  return {
    ...(typeof response?.status === 'number' && { status: response.status }),
    ...(typeof response?.data?.code === 'string' && { code: response.data.code }),
  };
}

export function isDefiniteQueuedTurnsUnsupported(error: unknown): boolean {
  const { status, code } = queuedTurnErrorResponse(error);
  return (
    (status === 404 && code == null) ||
    (status === 501 &&
      (code == null ||
        code === 'QUEUED_TURNS_UNSUPPORTED' ||
        code === 'QUEUED_TURN_PRIORITY_UNSUPPORTED'))
  );
}

/** A bounded origin 4xx proves the queued row was not committed. Timeouts and
 * early-data responses can be generated while the origin request continues,
 * so those remain outcome-ambiguous and must reconcile by request identity. */
export function isDefiniteQueuedTurnRejection(error: unknown): boolean {
  const { status } = queuedTurnErrorResponse(error);
  return (
    !isDefiniteQueuedTurnsUnsupported(error) &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 425
  );
}

export async function fetchAgentQueuedTurns(
  conversationId: string,
  clientRequestIds?: string[],
): Promise<AgentQueuedTurnReceipt[]> {
  const response = await dataService.listAgentQueuedTurns(conversationId, clientRequestIds);
  return response.queuedTurns;
}

export async function enqueueAgentQueuedTurn(
  input: EnqueueAgentQueuedTurnRequest,
): Promise<AgentQueuedTurnReceipt> {
  const response = await dataService.enqueueAgentQueuedTurn(input);
  return response.receipt;
}

export async function cancelAgentQueuedTurn(input: {
  conversationId: string;
  queuedTurnId: string;
}): Promise<AgentQueuedTurnReceipt> {
  const response = await dataService.cancelAgentQueuedTurn(input.queuedTurnId);
  return response.receipt;
}

/** Indeterminate admission deliberately retains its durable claim until exact
 * source evidence arrives. It can still be refreshed on mount/focus, but a
 * two-second loop cannot resolve it and disguises permanent quarantine as
 * ordinary progress. */
export function shouldPollAgentQueuedTurns(
  receipts: unknown,
  reconcileUntil?: number,
  observedAt = Date.now(),
): boolean {
  return (
    (reconcileUntil != null && observedAt < reconcileUntil) ||
    (Array.isArray(receipts) &&
      receipts.some(
        (item: AgentQueuedTurnReceipt) =>
          item.status === 'queued' ||
          (item.status === 'claimed' && item.failure?.code !== 'ADMISSION_INDETERMINATE'),
      ))
  );
}

export function useAgentQueuedTurns(
  conversationId: string,
  enabled: boolean,
  clientRequestIds: string[] = [],
  reconcileUntil?: number,
) {
  const knownIds = [...new Set(clientRequestIds)].sort();
  return useQuery({
    queryKey: agentQueuedTurnsQueryKey(conversationId, knownIds),
    queryFn: () => fetchAgentQueuedTurns(conversationId, knownIds),
    enabled: enabled && conversationId.length > 0,
    staleTime: 1_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: (receipts) =>
      shouldPollAgentQueuedTurns(receipts, reconcileUntil) ? 2_000 : false,
    retry: false,
  });
}

export function useEnqueueAgentQueuedTurnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.enqueueAgentQueuedTurn],
    mutationFn: enqueueAgentQueuedTurn,
    /** A retry can encounter admission middleware while the first request is
     * still committing. Reconcile ambiguous outcomes through the read-only
     * known-id projection instead of issuing a second mutating POST. */
    retry: false,
    onSettled: (_receipt, _error, input) =>
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.agentQueuedTurns, input.conversationId],
      }),
  });
}

export function useCancelAgentQueuedTurnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.cancelAgentQueuedTurn],
    mutationFn: cancelAgentQueuedTurn,
    onSuccess: (_receipt, input) =>
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.agentQueuedTurns, input.conversationId],
      }),
  });
}
