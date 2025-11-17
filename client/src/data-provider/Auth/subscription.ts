import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetSubscriptionStatus = (config = {}) => {
  return useQuery([
    QueryKeys.subscriptionStatus,
  ], () => dataService.getSubscriptionStatus(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};
