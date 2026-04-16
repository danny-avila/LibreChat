import { useRecoilValue } from 'recoil';
import { useQuery, type QueryObserverResult, type UseQueryOptions } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TBanner } from 'librechat-data-provider';
import store from '~/store';

/**
 * Hook to fetch all active banners for the current user
 */
export default function useBannersQuery(
  config?: UseQueryOptions<TBanner[]>,
): QueryObserverResult<TBanner[], unknown> {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);

  return useQuery<TBanner[]>([QueryKeys.banners], () => dataService.getActiveBanners(), {
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
}
