import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TContactsListParams, TContactsResponse } from 'librechat-data-provider';
import store from '~/store';
import { useRecoilValue } from 'recoil';

export const useContactsQuery = (
  params?: TContactsListParams,
  config?: UseQueryOptions<TContactsResponse>,
): QueryObserverResult<TContactsResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TContactsResponse>(
    [QueryKeys.contacts, params ?? {}],
    () => dataService.listContacts(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};