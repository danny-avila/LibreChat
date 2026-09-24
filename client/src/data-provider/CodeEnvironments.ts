import { DynamicQueryKeys, MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import {
  useIsFetching,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  TConversation,
  CodeEnvironmentUserSettings,
  TCodeEnvironmentMoveRequest,
  TCodeEnvironmentMoveResponse,
  TCodeEnvironmentPairingResponse,
  TCodeEnvironmentStatusResponse,
  TCodeEnvironmentsResponse,
} from 'librechat-data-provider';
import type { QueryFilters } from '@tanstack/react-query';
import { CONVERSATION_LIST_KEYS, updateConvoInAllQueries } from '~/utils';
import { retryTransientQuery } from './retry';

export type CodeEnvironmentPairingResponse = TCodeEnvironmentPairingResponse;

export function useCodeEnvironmentsQuery(enabled = true) {
  return useQuery<TCodeEnvironmentsResponse>(
    [QueryKeys.codeEnvironments],
    () => dataService.getCodeEnvironments(),
    { enabled },
  );
}

function codeEnvironmentStatusOptions(id: string, enabled: boolean) {
  return {
    queryKey: DynamicQueryKeys.codeEnvironmentStatus(id),
    queryFn: (): Promise<TCodeEnvironmentStatusResponse> =>
      dataService.getCodeEnvironmentStatus(id),
    enabled: enabled && id.length > 0,
    staleTime: 10_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: retryTransientQuery,
  };
}

export function useCodeEnvironmentStatusQuery(id: string, enabled = true) {
  return useQuery(codeEnvironmentStatusOptions(id, enabled));
}

export function useCodeEnvironmentStatusQueries(ids: string[], enabled = true) {
  return useQueries({ queries: ids.map((id) => codeEnvironmentStatusOptions(id, enabled)) });
}

/** Refresh discovery, not the conversation draft or expanded agent editor records. */
const isWorkspaceDiscovery: NonNullable<QueryFilters['predicate']> = ({ queryKey }) =>
  queryKey[0] === QueryKeys.endpoints ||
  queryKey[0] === QueryKeys.agents ||
  queryKey[0] === QueryKeys.codeEnvironments ||
  (queryKey[0] === QueryKeys.agent && queryKey.length === 2);

export function useCodeWorkspaceRefresh() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ predicate: isWorkspaceDiscovery }) > 0;
  return {
    isRefreshing,
    refresh: () => queryClient.invalidateQueries({ predicate: isWorkspaceDiscovery }),
  };
}

export function usePairCodeEnvironmentMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    TCodeEnvironmentPairingResponse,
    Error,
    { name: string; controlPlaneId: string }
  >([MutationKeys.pairCodeEnvironment], dataService.pairCodeEnvironment, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.codeEnvironments]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
    },
  });
}

export function useDeleteCodeEnvironmentMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    { environment: TCodeEnvironmentsResponse['environments'][number] },
    Error,
    string
  >([MutationKeys.deleteCodeEnvironment], dataService.deleteCodeEnvironment, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.codeEnvironments]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
    },
  });
}

export function useUpdateCodeEnvironmentSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    { environment: TCodeEnvironmentsResponse['environments'][number] },
    Error,
    { id: string; settings: CodeEnvironmentUserSettings }
  >([MutationKeys.updateCodeEnvironmentSettings], dataService.updateCodeEnvironmentSettings, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.codeEnvironments]);
      queryClient.invalidateQueries([QueryKeys.endpoints]);
    },
  });
}

/** Keeps every cached copy of the conversation on the decision the server just persisted. */
export function useMoveConversationCodeEnvironmentMutation() {
  const queryClient = useQueryClient();
  return useMutation<TCodeEnvironmentMoveResponse, Error, TCodeEnvironmentMoveRequest>(
    [MutationKeys.moveConversationCodeEnvironment],
    dataService.moveConversationCodeEnvironment,
    {
      onSuccess: async ({ conversationId, codeEnvironmentMode, codeWorkspaces }) => {
        /** A read already in flight could land after this write and restore the replaced decision. */
        await Promise.all(
          [[QueryKeys.conversation, conversationId], [QueryKeys.pinnedConversations]]
            .concat(CONVERSATION_LIST_KEYS.map((listKey) => [listKey]))
            .map((queryKey) => queryClient.cancelQueries({ queryKey })),
        );
        const applyDecision = (conversation: TConversation): TConversation => ({
          ...conversation,
          codeEnvironmentMode,
          codeWorkspaces,
        });
        updateConvoInAllQueries(queryClient, conversationId, applyDecision);
        queryClient.setQueryData<TConversation | undefined>(
          [QueryKeys.conversation, conversationId],
          (conversation) => (conversation == null ? conversation : applyDecision(conversation)),
        );
      },
    },
  );
}
