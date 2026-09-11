import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type {
  TArtifactAppList,
  TArtifactVersion,
  TArtifactVersionList,
  TArtifactAppWithVersion,
  ArtifactAppListScope,
} from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseQueryOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';

const ARTIFACT_APP_PAGE_SIZE = 20;

export const useListArtifactAppsQuery = (
  scope: ArtifactAppListScope = 'personal',
  config?: UseInfiniteQueryOptions<TArtifactAppList, Error>,
) => {
  return useInfiniteQuery<TArtifactAppList, Error>(
    [QueryKeys.artifactApps, scope],
    ({ pageParam }) =>
      dataService.listArtifactApps({
        scope,
        limit: ARTIFACT_APP_PAGE_SIZE,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    {
      getNextPageParam: (lastPage) =>
        lastPage.has_more && lastPage.after ? lastPage.after : undefined,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: 'always',
      ...config,
    },
  );
};

export const useGetArtifactAppBySourceQuery = (
  conversationId: string | null | undefined,
  sourceKey: string | null | undefined,
  config?: UseQueryOptions<TArtifactAppWithVersion>,
): QueryObserverResult<TArtifactAppWithVersion> => {
  const enabled = !!conversationId && !!sourceKey;
  return useQuery<TArtifactAppWithVersion>(
    [QueryKeys.artifactApp, 'source', conversationId, sourceKey],
    () => dataService.getArtifactAppBySource(conversationId as string, sourceKey as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};

export const useGetArtifactAppQuery = (
  artifactAppId: string | null | undefined,
  config?: UseQueryOptions<TArtifactAppWithVersion>,
): QueryObserverResult<TArtifactAppWithVersion> => {
  const enabled = !!artifactAppId;
  return useQuery<TArtifactAppWithVersion>(
    [QueryKeys.artifactApp, artifactAppId],
    () => dataService.getArtifactApp(artifactAppId as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};

export const useListArtifactAppVersionsQuery = (
  artifactAppId: string | null | undefined,
  config?: UseQueryOptions<TArtifactVersionList>,
): QueryObserverResult<TArtifactVersionList> => {
  const enabled = !!artifactAppId;
  return useQuery<TArtifactVersionList>(
    [QueryKeys.artifactAppVersions, artifactAppId],
    () => dataService.listArtifactAppVersions(artifactAppId as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};

export const useGetArtifactAppVersionQuery = (
  artifactAppId: string | null | undefined,
  versionId: string | null | undefined,
  config?: UseQueryOptions<TArtifactVersion>,
): QueryObserverResult<TArtifactVersion> => {
  const enabled = !!artifactAppId && !!versionId;
  return useQuery<TArtifactVersion>(
    [QueryKeys.artifactAppVersions, artifactAppId, versionId],
    () => dataService.getArtifactAppVersion(artifactAppId as string, versionId as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: enabled && (config?.enabled ?? true),
    },
  );
};
