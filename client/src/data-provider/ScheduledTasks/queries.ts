import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  QueryObserverResult,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import type {
  ScheduledTask,
  ScheduledTaskCreateParams,
  ScheduledTaskUpdateParams,
  ScheduledTaskListResponse,
  ScheduledTaskRunsResponse,
  ScheduledTaskRun,
} from 'librechat-data-provider';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useScheduledTasksQuery = (
  config?: UseQueryOptions<ScheduledTaskListResponse>,
): QueryObserverResult<ScheduledTaskListResponse> => {
  return useQuery<ScheduledTaskListResponse>(
    [QueryKeys.scheduledTasks],
    () => dataService.getScheduledTasks(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useScheduledTaskQuery = (
  taskId: string,
  config?: UseQueryOptions<ScheduledTask>,
): QueryObserverResult<ScheduledTask> => {
  return useQuery<ScheduledTask>(
    [QueryKeys.scheduledTasks, taskId],
    () => dataService.getScheduledTask(taskId),
    {
      enabled: !!taskId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useScheduledTaskRunsQuery = (
  taskId: string,
  config?: UseQueryOptions<ScheduledTaskRunsResponse>,
): QueryObserverResult<ScheduledTaskRunsResponse> => {
  return useQuery<ScheduledTaskRunsResponse>(
    [QueryKeys.scheduledTaskRuns, taskId],
    () => dataService.getScheduledTaskRuns(taskId),
    {
      enabled: !!taskId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useCreateScheduledTaskMutation = (
  options?: UseMutationOptions<ScheduledTask, Error, ScheduledTaskCreateParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation<ScheduledTask, Error, ScheduledTaskCreateParams>(
    (data) => dataService.createScheduledTask(data),
    {
      ...options,
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
        options?.onSuccess?.(data, variables, context);
      },
    },
  );
};

export const useUpdateScheduledTaskMutation = (
  options?: UseMutationOptions<
    ScheduledTask,
    Error,
    { taskId: string; data: ScheduledTaskUpdateParams }
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation<ScheduledTask, Error, { taskId: string; data: ScheduledTaskUpdateParams }>(
    ({ taskId, data }) => dataService.updateScheduledTask(taskId, data),
    {
      ...options,
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
        queryClient.invalidateQueries([QueryKeys.scheduledTasks, variables.taskId]);
        options?.onSuccess?.(data, variables, context);
      },
    },
  );
};

export const useDeleteScheduledTaskMutation = (
  options?: UseMutationOptions<void, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>((taskId) => dataService.deleteScheduledTask(taskId), {
    ...options,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
      options?.onSuccess?.(data, variables, context);
    },
  });
};

export const useRunScheduledTaskMutation = (
  options?: UseMutationOptions<ScheduledTaskRun, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<ScheduledTaskRun, Error, string>(
    (taskId) => dataService.runScheduledTask(taskId),
    {
      ...options,
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.scheduledTasks]);
        queryClient.invalidateQueries([QueryKeys.scheduledTaskRuns, variables]);
        options?.onSuccess?.(data, variables, context);
      },
    },
  );
};
