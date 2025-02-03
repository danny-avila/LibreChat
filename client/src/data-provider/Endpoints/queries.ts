import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: UseQueryOptions<t.TEndpointsConfig, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.TEndpointsConfig, unknown, TData>(
    [QueryKeys.endpoints],
    () => dataService.getAIEndpoints(),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetStartupConfig = (
  config?: UseQueryOptions<t.TStartupConfig>,
): QueryObserverResult<t.TStartupConfig> => {
  return useQuery<t.TStartupConfig>(
    [QueryKeys.startupConfig],
    () => dataService.getStartupConfig(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
