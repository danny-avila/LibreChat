import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

function invalidateIntegrationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  providerKey: string,
) {
  queryClient.invalidateQueries([QueryKeys.integrations]);
  queryClient.invalidateQueries([QueryKeys.integrationStatus, providerKey]);
}

export const useCreateIntegrationConnectSessionMutation = (): UseMutationResult<
  t.IntegrationConnectSessionResponse,
  Error,
  string
> => {
  return useMutation((providerKey: string) =>
    dataService.createIntegrationConnectSession(providerKey),
  );
};

export const useSyncIntegrationConnectionMutation = (): UseMutationResult<
  t.IntegrationSyncResponse,
  Error,
  string
> => {
  const queryClient = useQueryClient();

  return useMutation((providerKey: string) => dataService.syncIntegrationConnection(providerKey), {
    onSuccess: (_data, providerKey) => {
      invalidateIntegrationQueries(queryClient, providerKey);
    },
  });
};

export const useDisconnectIntegrationMutation = (): UseMutationResult<
  { success: boolean },
  Error,
  string
> => {
  const queryClient = useQueryClient();

  return useMutation((providerKey: string) => dataService.disconnectIntegration(providerKey), {
    onSuccess: (_data, providerKey) => {
      invalidateIntegrationQueries(queryClient, providerKey);
    },
  });
};
