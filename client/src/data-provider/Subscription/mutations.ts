import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MutationOptions } from 'librechat-data-provider';
import type { TSubscriptionCheckoutResponse, TSubscriptionResponse } from './types';

export const useRefreshSubscriptionMutation = (
  options?: MutationOptions<TSubscriptionResponse, undefined, unknown, unknown>,
): UseMutationResult<TSubscriptionResponse, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([QueryKeys.subscription, 'refresh'], {
    mutationFn: () => dataService.refreshSubscription() as Promise<TSubscriptionResponse>,
    ...(options || {}),
    onSuccess: (data, ...args) => {
      queryClient.setQueryData([QueryKeys.subscription], data);
      options?.onSuccess?.(data, ...args);
    },
  });
};

export const useSubscriptionCheckoutLinkMutation = (
  options?: MutationOptions<TSubscriptionCheckoutResponse, undefined, unknown, unknown>,
): UseMutationResult<TSubscriptionCheckoutResponse, unknown, undefined, unknown> => {
  return useMutation([QueryKeys.subscription, 'checkout'], {
    mutationFn: () =>
      dataService.getSubscriptionCheckoutLink() as Promise<TSubscriptionCheckoutResponse>,
    ...(options || {}),
  });
};
