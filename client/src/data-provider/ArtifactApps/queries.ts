import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  TArtifactApp,
  TArtifactAppList,
  TArtifactVersion,
  TArtifactVersionList,
  TArtifactAppWithVersion,
} from 'librechat-data-provider';

export const useListArtifactAppsQuery = (
  config?: UseQueryOptions<TArtifactAppList>,
): QueryObserverResult<TArtifactAppList> => {
  return useQuery<TArtifactAppList>(
    [QueryKeys.artifactApps],
    () => dataService.listArtifactApps(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
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
