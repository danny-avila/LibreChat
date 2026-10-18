import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type {
  OrganizationMembersParams,
  TOrganizationsResponse,
  TOrganizationInvitePreview,
  TCurrentOrganizationResponse,
  TOrganizationMembersResponse,
  TOrganizationInvitesResponse,
  TPendingOrganizationInvitesResponse,
} from 'librechat-data-provider';
import type {
  UseQueryOptions,
  QueryObserverResult,
  UseInfiniteQueryResult,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import store from '~/store';

const quiet = { refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false } as const;

/** The signed-in account's organizations; `onboardingToken` lets an account with none ask. */
export const useOrganizationsQuery = (
  onboardingToken?: string,
  config?: UseQueryOptions<TOrganizationsResponse>,
): QueryObserverResult<TOrganizationsResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TOrganizationsResponse>(
    [QueryKeys.organizations],
    () => dataService.getOrganizations(onboardingToken),
    {
      ...quiet,
      ...config,
      enabled: (config?.enabled ?? true) && (queriesEnabled || !!onboardingToken),
    },
  );
};

export const useCurrentOrganizationQuery = (
  config?: UseQueryOptions<TCurrentOrganizationResponse>,
): QueryObserverResult<TCurrentOrganizationResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TCurrentOrganizationResponse>(
    [QueryKeys.currentOrganization],
    () => dataService.getCurrentOrganization(),
    { ...quiet, ...config, enabled: (config?.enabled ?? true) && queriesEnabled },
  );
};

export const ORGANIZATION_MEMBERS_PAGE_SIZE = 50;

/** The current organization's members, a page at a time, keyed on the search. */
export const useOrganizationMembersInfiniteQuery = (
  params: Pick<OrganizationMembersParams, 'search'>,
  config?: UseInfiniteQueryOptions<TOrganizationMembersResponse>,
): UseInfiniteQueryResult<TOrganizationMembersResponse> =>
  useInfiniteQuery<TOrganizationMembersResponse>(
    [QueryKeys.organizationMembers, params],
    ({ pageParam }) =>
      dataService.getOrganizationMembers({
        ...params,
        limit: ORGANIZATION_MEMBERS_PAGE_SIZE,
        after: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    {
      ...quiet,
      keepPreviousData: true,
      getNextPageParam: (lastPage) =>
        lastPage.members.length === ORGANIZATION_MEMBERS_PAGE_SIZE
          ? lastPage.members[lastPage.members.length - 1]?.id
          : undefined,
      ...config,
    },
  );

export const useOrganizationInvitesQuery = (
  config?: UseQueryOptions<TOrganizationInvitesResponse>,
): QueryObserverResult<TOrganizationInvitesResponse> =>
  useQuery<TOrganizationInvitesResponse>(
    [QueryKeys.organizationInvites],
    () => dataService.getOrganizationInvites(),
    { ...quiet, ...config },
  );

/** What an invite link opens; needs no session. */
export const useOrganizationInvitePreviewQuery = (
  token: string,
  config?: UseQueryOptions<TOrganizationInvitePreview>,
): QueryObserverResult<TOrganizationInvitePreview> =>
  useQuery<TOrganizationInvitePreview>(
    [QueryKeys.organizationInvitePreview, token],
    () => dataService.previewOrganizationInvite(token),
    { ...quiet, ...config, enabled: (config?.enabled ?? true) && !!token },
  );

export const usePendingOrganizationInvitesQuery = (
  onboardingToken?: string,
  config?: UseQueryOptions<TPendingOrganizationInvitesResponse>,
): QueryObserverResult<TPendingOrganizationInvitesResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<TPendingOrganizationInvitesResponse>(
    [QueryKeys.pendingOrganizationInvites],
    () => dataService.getPendingOrganizationInvites(onboardingToken),
    {
      ...quiet,
      ...config,
      enabled: (config?.enabled ?? true) && (queriesEnabled || !!onboardingToken),
    },
  );
};
