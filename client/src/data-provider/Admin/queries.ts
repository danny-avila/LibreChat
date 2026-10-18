import { useRecoilValue } from 'recoil';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TAdminSession,
  TAdminOrganizationsQuery,
  TAdminOrganizationsResponse,
} from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import store from '~/store';

const quiet = { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false } as const;

/** Whether the signed-in person can open the built-in admin panel: data only when they can. */
export const useAdminSessionQuery = (
  config?: UseQueryOptions<TAdminSession>,
): QueryObserverResult<TAdminSession> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TAdminSession>([QueryKeys.adminSession], () => dataService.getAdminSession(), {
    ...quiet,
    staleTime: 60_000,
    ...config,
    enabled: (config?.enabled ?? true) && queriesEnabled,
  });
};

/** Every organization on the platform, for the operator's switcher; keyed on the search. */
export const useAdminOrganizationsQuery = (
  params: TAdminOrganizationsQuery,
  config?: UseQueryOptions<TAdminOrganizationsResponse>,
): QueryObserverResult<TAdminOrganizationsResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TAdminOrganizationsResponse>(
    [QueryKeys.adminOrganizations, params],
    () => dataService.getAdminOrganizations(params),
    {
      ...quiet,
      keepPreviousData: true,
      ...config,
      enabled: (config?.enabled ?? true) && queriesEnabled,
    },
  );
};
