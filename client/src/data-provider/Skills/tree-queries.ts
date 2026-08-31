import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TSkillTreeResponse } from 'librechat-data-provider';

export const useGetSkillTreeQuery = (
  skillId: string | null | undefined,
  config?: UseQueryOptions<TSkillTreeResponse>,
): QueryObserverResult<TSkillTreeResponse> => {
  return useQuery<TSkillTreeResponse>(
    [QueryKeys.skillTree, skillId],
    () => dataService.getSkillTree(skillId as string),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      enabled: !!skillId && (config?.enabled ?? true),
      ...config,
    },
  );
};

export const useGetSkillNodeContentQuery = (
  skillId: string | null | undefined,
  nodeId: string | null | undefined,
  config?: UseQueryOptions<{ content: string; mimeType: string }>,
): QueryObserverResult<{ content: string; mimeType: string }> => {
  return useQuery<{ content: string; mimeType: string }>(
    [QueryKeys.skillNodeContent, skillId, nodeId],
    () =>
      dataService.getSkillNodeContent({
        skillId: skillId as string,
        nodeId: nodeId as string,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled: !!skillId && !!nodeId && (config?.enabled ?? true),
      ...config,
    },
  );
};
