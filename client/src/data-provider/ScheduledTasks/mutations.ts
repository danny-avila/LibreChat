import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { TCreateScheduledTask, TUpdateScheduledTask } from 'librechat-data-provider';

export const useCreateScheduledTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.createScheduledTask],
    mutationFn: (payload: TCreateScheduledTask) => dataService.createScheduledTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
    },
  });
};

export const useUpdateScheduledTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.updateScheduledTask],
    mutationFn: ({ id, payload }: { id: string; payload: TUpdateScheduledTask }) =>
      dataService.updateScheduledTask(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
    },
  });
};

export const useDeleteScheduledTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.deleteScheduledTask],
    mutationFn: (id: string) => dataService.deleteScheduledTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
    },
  });
};
