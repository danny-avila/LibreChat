import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { AdminUsageResponse } from 'librechat-data-provider';

export const useAdminUsageQuery = (
  config?: UseQueryOptions<AdminUsageResponse>,
): QueryObserverResult<AdminUsageResponse> => {
  return useQuery<AdminUsageResponse>(
    [QueryKeys.adminUsage],
    () => dataService.getAdminUsage(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
    },
  );
};
