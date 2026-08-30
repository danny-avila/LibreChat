import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import type {
  TAgentQueuedTurnReceipt,
  TEnqueueAgentQueuedTurnRequest,
} from 'librechat-data-provider';

export type AgentQueuedTurnReceipt = TAgentQueuedTurnReceipt;
export type EnqueueAgentQueuedTurnRequest = TEnqueueAgentQueuedTurnRequest;

export const agentQueuedTurnsQueryKey = (conversationId: string) =>
  [QueryKeys.agentQueuedTurns, conversationId] as const;

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

export function shouldRetryAgentQueuedTurnEnqueue(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 3 &&
    !isDefiniteQueuedTurnsUnsupported(error) &&
    !isDefiniteQueuedTurnRejection(error)
  );
}

export async function fetchAgentQueuedTurns(
  conversationId: string,
): Promise<AgentQueuedTurnReceipt[]> {
  const response = await dataService.listAgentQueuedTurns(conversationId);
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

export function useAgentQueuedTurns(
  conversationId: string,
  enabled: boolean,
  reconcileUntil?: number,
) {
  return useQuery({
    queryKey: agentQueuedTurnsQueryKey(conversationId),
    queryFn: () => fetchAgentQueuedTurns(conversationId),
    enabled: enabled && conversationId.length > 0,
    staleTime: 1_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: (receipts) => {
      return (reconcileUntil != null && Date.now() < reconcileUntil) ||
        (Array.isArray(receipts) &&
          receipts.some((item) => item.status === 'queued' || item.status === 'claimed'))
        ? 2_000
        : false;
    },
    retry: false,
  });
}

export function useEnqueueAgentQueuedTurnMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.enqueueAgentQueuedTurn],
    mutationFn: enqueueAgentQueuedTurn,
    /** Replay the exact body and clientRequestId. The server returns the
     * durable receipt whether the first POST was lost, scheduling-pending, or
     * already admitted, without creating a second logical turn. */
    retry: shouldRetryAgentQueuedTurnEnqueue,
    retryDelay: (attempt) => Math.min(250 * 2 ** attempt, 2_000),
    /** Both success and failure can follow a committed POST (lost 202 or the
     * record-first scheduler's 503). Always reconcile the stable request id. */
    onSettled: (_receipt, _error, input) =>
      queryClient.invalidateQueries({
        queryKey: agentQueuedTurnsQueryKey(input.conversationId),
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
        queryKey: agentQueuedTurnsQueryKey(input.conversationId),
      }),
  });
}
