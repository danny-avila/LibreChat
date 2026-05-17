import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetScheduledTasks = () => {
  return useQuery({
    queryKey: [QueryKeys.scheduledTasks],
    queryFn: () => dataService.getScheduledTasks(),
  });
};
