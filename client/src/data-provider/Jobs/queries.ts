import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TAgentJobsResponse, TAgentJobResponse } from 'librechat-data-provider';

/** Lists the current user's long-horizon jobs, optionally filtered by status or conversation. */
export const useJobsQuery = (
  params?: { status?: string; conversationId?: string },
  config?: UseQueryOptions<TAgentJobsResponse>,
): QueryObserverResult<TAgentJobsResponse> => {
  return useQuery<TAgentJobsResponse>(
    [QueryKeys.jobs, params?.status ?? 'all', params?.conversationId ?? 'all'],
    () => dataService.getJobs(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

/** Fetches a single job's status + steps. */
export const useJobQuery = (
  id: string,
  config?: UseQueryOptions<TAgentJobResponse>,
): QueryObserverResult<TAgentJobResponse> => {
  return useQuery<TAgentJobResponse>([QueryKeys.job, id], () => dataService.getJob(id), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!id,
    ...config,
  });
};

export const useInvalidateJobs = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries([QueryKeys.jobs]);
};
