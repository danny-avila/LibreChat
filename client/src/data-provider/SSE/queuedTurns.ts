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

export function isDefiniteQueuedTurnsUnsupported(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | undefined)?.response?.status;
  return status === 404 || status === 501;
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

export function useAgentQueuedTurns(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: agentQueuedTurnsQueryKey(conversationId),
    queryFn: () => fetchAgentQueuedTurns(conversationId),
    enabled: enabled && conversationId.length > 0,
    staleTime: 1_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: (receipts) => {
      return Array.isArray(receipts) &&
        receipts.some((item) => item.status === 'queued' || item.status === 'claimed')
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
    onSuccess: (_receipt, input) =>
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
