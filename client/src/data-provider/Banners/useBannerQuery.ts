import { useQuery, type QueryObserverResult, type UseQueryOptions } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TBannerResponse } from 'librechat-data-provider';

/**
 * Hook to fetch the first active banner (legacy endpoint)
 */
export default function useBannerQuery(
  config?: UseQueryOptions<TBannerResponse>,
): QueryObserverResult<TBannerResponse, unknown> {
  return useQuery<TBannerResponse>([QueryKeys.banner], () => dataService.getBanner(), {
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
}
