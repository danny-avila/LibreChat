import { DynamicQueryKeys, MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import {
  useIsMutating,
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
import type { SetterOrUpdater } from 'recoil';
import { CONVERSATION_LIST_KEYS, updateConvoInAllQueries } from '~/utils';
import { hasSameCodeDecision } from '~/hooks/Agents/codeDecision';

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

/**
 * Whether a conversation's sealed decision is being replaced right now. The server checks for
 * active work before it polls the target workspace, so a turn submitted during that poll starts
 * under the decision being replaced and silently runs without the workspace its owner just chose.
 * Callers use this to withhold submission until the replacement settles.
 */
export function useIsReplacingConversationCodeEnvironment(conversationId?: string | null): boolean {
  return (
    useIsMutating({
      predicate: (mutation) =>
        [
          MutationKeys.moveConversationCodeEnvironment,
          'reconcileConversationCodeEnvironment',
        ].includes(String(mutation.options.mutationKey?.[0])) &&
        conversationId != null &&
        (mutation.state.variables as TCodeEnvironmentMoveRequest | undefined)?.conversationId ===
          conversationId,
    }) > 0
  );
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

/** A terminal error does not say whether the server persisted the attempted decision. Read it,
 * rather than rolling back a decision a failed turn may already have established. */
export function useReconcileConversationCodeEnvironmentMutation(
  setConversation?: SetterOrUpdater<TConversation | null>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['reconcileConversationCodeEnvironment'],
    mutationFn: async ({
      conversationId,
    }: {
      conversationId: string;
      attempted: Pick<TConversation, 'codeEnvironmentMode' | 'codeWorkspaces'>;
    }) => {
      const queryKey = [QueryKeys.conversation, conversationId];
      await queryClient.cancelQueries({ queryKey });
      return queryClient.fetchQuery(
        queryKey,
        () => dataService.getConversationById(conversationId),
        {
          staleTime: 0,
        },
      );
    },
    onSuccess: (persisted, { conversationId, attempted }) => {
      if (persisted.conversationId !== conversationId) return;
      const apply = (current: TConversation): TConversation =>
        current.conversationId === conversationId && hasSameCodeDecision(current, attempted)
          ? {
              ...current,
              codeEnvironmentMode: persisted.codeEnvironmentMode,
              codeWorkspaces: persisted.codeWorkspaces,
            }
          : current;
      updateConvoInAllQueries(queryClient, conversationId, apply);
      setConversation?.((current) => (current == null ? current : apply(current)));
    },
  });
}
