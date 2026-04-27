import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import store from '~/store';
import type { TSubscriptionResponse } from './types';

export const useGetSubscriptionQuery = (
  config?: UseQueryOptions<TSubscriptionResponse>,
): QueryObserverResult<TSubscriptionResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TSubscriptionResponse>(
    [QueryKeys.subscription],
    () => dataService.getSubscription() as Promise<TSubscriptionResponse>,
    {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};
