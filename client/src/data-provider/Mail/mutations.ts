import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

export const useDisconnectMailMutation = (options?: {
  onSuccess?: (data: { success: boolean }, provider: string) => void;
  onError?: (error: Error, provider: string) => void;
}): UseMutationResult<{ success: boolean }, Error, string> => {
  const queryClient = useQueryClient();

  return useMutation((provider: string) => dataService.disconnectMailProvider(provider), {
    onSuccess: (data, provider) => {
      queryClient.invalidateQueries([QueryKeys.mailConnectionStatus]);
      options?.onSuccess?.(data, provider);
    },
    onError: (error, provider) => {
      options?.onError?.(error, provider);
    },
  });
};
