import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TCodeEnvironmentPairingResponse,
  TCodeEnvironmentsResponse,
} from 'librechat-data-provider';

export type CodeEnvironmentPairingResponse = TCodeEnvironmentPairingResponse;

export function useCodeEnvironmentsQuery(enabled = true) {
  return useQuery<TCodeEnvironmentsResponse>(
    [QueryKeys.codeEnvironments],
    () => dataService.getCodeEnvironments(),
    { enabled },
  );
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
  return useMutation<unknown, Error, string>(
    [MutationKeys.deleteCodeEnvironment],
    dataService.deleteCodeEnvironment,
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.codeEnvironments]);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
}
