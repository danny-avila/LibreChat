import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: UseQueryOptions<t.TEndpointsConfig, unknown, TData>,
): QueryObserverResult<TData> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TEndpointsConfig, unknown, TData>(
    [QueryKeys.endpoints],
    () => dataService.getAIEndpoints(),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useTokenConfigQuery = (
  config?: UseQueryOptions<t.TTokenConfigMap>,
): QueryObserverResult<t.TTokenConfigMap> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TTokenConfigMap>([QueryKeys.tokenConfig], () => dataService.getTokenConfig(), {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    /** Refetch on mount only when stale — with `staleTime: Infinity` that's
     *  exclusively after a user-key change invalidates `tokenConfig`, so a
     *  settings change made while the gauge is unmounted is picked up on
     *  return instead of serving the prior key's resolved config */
    refetchOnMount: true,
    ...config,
    enabled: (config?.enabled ?? true) === true && queriesEnabled,
  });
};

/**
 * Auth-aware query key so unauthenticated (login page) and authenticated
 * (chat page) configs are cached independently, preventing stale
 * unauthenticated config from persisting after login.
 */
export const startupConfigKey = (isAuthenticated: boolean, context?: t.StartupConfigContext) =>
  [QueryKeys.startupConfig, isAuthenticated, context ?? 'default'] as const;

export const useGetStartupConfig = (
  config?: UseQueryOptions<t.TStartupConfig>,
  options?: { context?: t.StartupConfigContext },
): QueryObserverResult<t.TStartupConfig> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  const user = useRecoilValue<t.TUser | undefined>(store.user);
  return useQuery<t.TStartupConfig>(
    startupConfigKey(!!user, options?.context),
    () => dataService.getStartupConfig({ context: options?.context }),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};
