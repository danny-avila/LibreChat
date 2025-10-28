import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetBannerQuery = (
  config?: Omit<UseQueryOptions<t.TBannerResponse, unknown, t.TBannerResponse>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TBannerResponse, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.banner],
    queryFn: () => dataService.getBanner(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetUserBalance = (
  config?: Omit<UseQueryOptions<t.TBalanceResponse, unknown, t.TBalanceResponse>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TBalanceResponse, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.balance],
    queryFn: () => dataService.getUserBalance(),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

export const useGetSearchEnabledQuery = (
  config?: Omit<UseQueryOptions<boolean, unknown, boolean>, 'queryKey' | 'queryFn'>,
): UseQueryResult<boolean, unknown> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery({
    queryKey: [QueryKeys.searchEnabled],
    queryFn: () => dataService.getSearchEnabled(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};
