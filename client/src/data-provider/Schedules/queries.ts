/* Scheduled chats */
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TSchedulesResponse } from 'librechat-data-provider';

export const useSchedulesQuery = (
  config?: UseQueryOptions<TSchedulesResponse>,
): QueryObserverResult<TSchedulesResponse> => {
  return useQuery<TSchedulesResponse>([QueryKeys.schedules], () => dataService.getSchedules(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    ...config,
  });
};
