import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DynamicQueryKeys, MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TConversation,
  CodeEnvironmentUserSettings,
  TCodeEnvironmentMoveRequest,
  TCodeEnvironmentMoveResponse,
  TCodeEnvironmentPairingResponse,
  TCodeEnvironmentStatusResponse,
  TCodeEnvironmentsResponse,
} from 'librechat-data-provider';
import { updateConvoInAllQueries } from '~/utils';

export type CodeEnvironmentPairingResponse = TCodeEnvironmentPairingResponse;

export function useCodeEnvironmentsQuery(enabled = true) {
  return useQuery<TCodeEnvironmentsResponse>(
    [QueryKeys.codeEnvironments],
    () => dataService.getCodeEnvironments(),
    { enabled },
  );
}

export function useCodeEnvironmentStatusQuery(id: string, enabled = true) {
  return useQuery<TCodeEnvironmentStatusResponse>(
    DynamicQueryKeys.codeEnvironmentStatus(id),
    () => dataService.getCodeEnvironmentStatus(id),
    {
      enabled: enabled && id.length > 0,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
}

export function useCodeEnvironmentStatusQueries(ids: string[], enabled = true) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: DynamicQueryKeys.codeEnvironmentStatus(id),
      queryFn: () => dataService.getCodeEnvironmentStatus(id),
      enabled: enabled && id.length > 0,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });
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
      onSuccess: ({ conversationId, codeEnvironmentMode, codeWorkspaces }) => {
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
