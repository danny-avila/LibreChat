import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

// Define interface for subscription ID parameter
interface CreateOmnexioSubscriptionParams {
  subscriptionId: number;
}

/**
 * Hook for creating an Omnexio subscription
 */
export const useCreateOmnexioSubscription = (): UseMutationResult<
  string, // response type
  unknown, // error type
  CreateOmnexioSubscriptionParams, // variables type
  unknown // context type
> => {
  return useMutation(
    (params: CreateOmnexioSubscriptionParams) =>
      dataService.createOmnexioSubscription(params.subscriptionId),
    {
      onError: (error) => {
        console.error('Error creating subscription:', error);
      },
    },
  );
};

/**
 * Hook for changing an existing Omnexio subscription
 */
export const useChangeOmnexioSubscription = (): UseMutationResult<
  void, // response type
  unknown, // error type
  CreateOmnexioSubscriptionParams, // variables type (reusing the same interface)
  unknown // context type
> => {
  return useMutation(
    (params: CreateOmnexioSubscriptionParams) =>
      dataService.changeOmnexioSubscription(params.subscriptionId),
    {
      onError: (error) => {
        console.error('Error changing subscription:', error);
      },
    },
  );
};
