import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * Hook for creating an Omnexio subscription
 */
export const useCreateGuest = (): UseMutationResult<{ username: string; password: string }> => {
  return useMutation(() => dataService.createGuest(), {
    onError: (error) => {
      console.error('Error creating subscription:', error);
    },
  });
};
