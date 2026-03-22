import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, EModelEndpoint, dataService } from 'librechat-data-provider';
import type { OpenClawModelEntry, OpenClawSkillEntry, OpenClawToolCatalogEntry } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

function useIsOpenClaw(): boolean {
  const queryClient = useQueryClient();
  const endpoints = queryClient.getQueryData<Record<string, unknown>>([QueryKeys.endpoints]);
  return !!endpoints?.[EModelEndpoint.openclaw];
}

export const useOpenClawModelsQuery = () => {
  const enabled = useIsOpenClaw();
  return useQuery<OpenClawModelEntry[]>(
    [QueryKeys.openClawModels],
    async () => {
      const res = await dataService.getOpenClawModels();
      return res.models;
    },
    { enabled, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );
};

export const useOpenClawSkillsQuery = () => {
  const enabled = useIsOpenClaw();
  return useQuery<OpenClawSkillEntry[]>(
    [QueryKeys.openClawSkills],
    async () => {
      const res = await dataService.getOpenClawSkills();
      return res.skills;
    },
    { enabled, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );
};

export const useOpenClawToolsQuery = () => {
  const enabled = useIsOpenClaw();
  return useQuery<OpenClawToolCatalogEntry[]>(
    [QueryKeys.openClawTools],
    async () => {
      const res = await dataService.getOpenClawTools();
      return res.tools;
    },
    { enabled, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );
};

export const useSwitchOpenClawModel = (): UseMutationResult<
  { success: boolean },
  unknown,
  { model: string; sessionKey: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(dataService.switchOpenClawModel, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.openClawModels]);
    },
  });
};
