import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

// Define interface for subscription ID parameter
interface CreateOmnexioSubscriptionParams {
  subscriptionId: number;
}

// Define response type for subscription creation
interface CreateOmnexioSubscriptionResponse {
  paymentUrl: string;
}

/**
 * Hook for creating an Omnexio subscription
 */
export const useCreateOmnexioSubscription = (): UseMutationResult<
  CreateOmnexioSubscriptionResponse, // response type
  unknown, // error type
  CreateOmnexioSubscriptionParams, // variables type
  unknown // context type
> => {
  return useMutation(
    (params: CreateOmnexioSubscriptionParams) =>
      dataService.createOmnexioSubscription(params.subscriptionId),
    {
      onSuccess: (data) => {
        // Redirect to the payment URL
        if (data) {
          window.location.href = data;
        } else {
          console.error('No payment URL received from the server');
        }
      },
      onError: (error) => {
        console.error('Error creating subscription:', error);
      },
    },
  );
};
