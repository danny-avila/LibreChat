import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';

export const useIntegrationsQuery = <TData = t.IntegrationsListResponse>(
  config?: UseQueryOptions<t.IntegrationsListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.IntegrationsListResponse, unknown, TData>(
    [QueryKeys.integrations],
    () => dataService.getIntegrations(),
    {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: false,
      ...config,
    },
  );
};

export const useIntegrationStatusQuery = <TData = t.IntegrationStatusResponse>(
  providerKey: string,
  config?: UseQueryOptions<t.IntegrationStatusResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.IntegrationStatusResponse, unknown, TData>(
    [QueryKeys.integrationStatus, providerKey],
    () => dataService.getIntegrationStatus(providerKey),
    {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: false,
      ...config,
    },
  );
};
