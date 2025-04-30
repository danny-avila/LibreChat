import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions, UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetBannerQuery = (
  config?: UseQueryOptions<t.TBannerResponse>,
): QueryObserverResult<t.TBannerResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TBannerResponse>([QueryKeys.banner], () => dataService.getBanner(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetUserBalance = (
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<string>([QueryKeys.balance], () => dataService.getUserBalance(), {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetSearchEnabledQuery = (
  config?: UseQueryOptions<boolean>,
): QueryObserverResult<boolean> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<boolean>([QueryKeys.searchEnabled], () => dataService.getSearchEnabled(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetOmnexioUserBalance = (
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> => {
  return useQuery<string>([QueryKeys.omnexioBalance], () => dataService.getOmnexioUserBalance(), {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    ...config,
    enabled: true,
  });
};

// Define interface for subscription ID parameter
interface CreateOmnexioSubscriptionParams {
  subscriptionId: number;
}

// Define response type for subscription creation
interface CreateOmnexioSubscriptionResponse {
  paymentUrl: string;
}

// Add the new mutation for creating a subscription
export const useCreateOmnexioSubscription = (): UseMutationResult<
  CreateOmnexioSubscriptionResponse, // response type
  unknown, // error type
  CreateOmnexioSubscriptionParams, // variables type
  unknown // context type
> => {
  return useMutation(
    (params: CreateOmnexioSubscriptionParams) => dataService.createOmnexioSubscription(params.subscriptionId),
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
    }
  );
};
