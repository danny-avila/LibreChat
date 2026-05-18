import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TScheduledTask } from 'librechat-data-provider';

export const useGetScheduledTasks = (
  config?: UseQueryOptions<TScheduledTask[]>,
): QueryObserverResult<TScheduledTask[]> => {
  return useQuery<TScheduledTask[]>(
    [QueryKeys.scheduledTasks],
    () => dataService.getScheduledTasks(),
    config,
  );
};
