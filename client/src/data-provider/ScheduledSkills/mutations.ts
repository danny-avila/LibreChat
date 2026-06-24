import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TCreateSkillSchedule,
  TUpdateSkillSchedule,
  TSkillScheduleResponse,
  TRunSkillScheduleResponse,
} from 'librechat-data-provider';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries([QueryKeys.skillSchedules]);
};

export const useCreateSkillScheduleMutation = (): UseMutationResult<
  TSkillScheduleResponse,
  unknown,
  TCreateSkillSchedule
> => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: TCreateSkillSchedule) => dataService.createSkillSchedule(payload),
    onSuccess: () => invalidate(),
  });
};

export const useUpdateSkillScheduleMutation = (): UseMutationResult<
  TSkillScheduleResponse,
  unknown,
  { id: string; payload: TUpdateSkillSchedule }
> => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TUpdateSkillSchedule }) =>
      dataService.updateSkillSchedule(id, payload),
    onSuccess: () => invalidate(),
  });
};

export const useDeleteSkillScheduleMutation = (): UseMutationResult<
  { success: boolean },
  unknown,
  string
> => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => dataService.deleteSkillSchedule(id),
    onSuccess: () => invalidate(),
  });
};

export const useRunSkillScheduleMutation = (): UseMutationResult<
  TRunSkillScheduleResponse,
  unknown,
  string
> => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => dataService.runSkillSchedule(id),
    onSuccess: () => invalidate(),
  });
};
