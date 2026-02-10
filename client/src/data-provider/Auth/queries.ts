import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useGetUserQuery = (
  config?: UseQueryOptions<t.TUser>,
): QueryObserverResult<t.TUser> => {
  return useQuery<t.TUser>([QueryKeys.user], () => dataService.getUser(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export interface UseGraphTokenQueryOptions {
  scopes?: string;
  enabled?: boolean;
}

export const useGraphTokenQuery = (
  options: UseGraphTokenQueryOptions = {},
  config?: UseQueryOptions<any>,
): QueryObserverResult<any> => {
  const { scopes, enabled = false } = options;

  return useQuery({
    queryKey: [QueryKeys.graphToken, scopes],
    queryFn: () => dataService.getGraphApiToken({ scopes: scopes ?? '' }),
    enabled,
    staleTime: 50 * 60 * 1000, // 50 minutes (tokens expire in 60 minutes)
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};
