import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TSkillSchedulesResponse } from 'librechat-data-provider';

/** Lists the current user's skill schedules. */
export const useSkillSchedulesQuery = (
  config?: UseQueryOptions<TSkillSchedulesResponse>,
): QueryObserverResult<TSkillSchedulesResponse> => {
  return useQuery<TSkillSchedulesResponse>(
    [QueryKeys.skillSchedules],
    () => dataService.getSkillSchedules(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useInvalidateSkillSchedules = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries([QueryKeys.skillSchedules]);
};
