import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: Omit<UseQueryOptions<t.TEndpointsConfig, unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.endpoints],
    queryFn: () => dataService.getAIEndpoints(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled
  });
};

export const useGetStartupConfig = (
  config?: Omit<UseQueryOptions<t.TStartupConfig, unknown, t.TStartupConfig>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TStartupConfig, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.startupConfig],
    queryFn: () => dataService.getStartupConfig(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};
