import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TCreateAgentJob,
  TAgentJobResponse,
  TSubmitClientOpResult,
} from 'librechat-data-provider';
import { patchJobInListCache } from '~/hooks/Jobs/cache';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries([QueryKeys.jobs]);
};

export const useCreateJobMutation = (): UseMutationResult<
  TAgentJobResponse,
  unknown,
  TCreateAgentJob
> => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: TCreateAgentJob) => dataService.createJob(payload),
    onSuccess: () => invalidate(),
  });
};

export const useCancelJobMutation = (): UseMutationResult<TAgentJobResponse, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dataService.cancelJob(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries([QueryKeys.jobs]);
      if (data?.job?._id) {
        queryClient.setQueryData([QueryKeys.job, data.job._id], data);
      }
    },
  });
};

type SubmitClientOpVariables = {
  jobId: string;
  payload: TSubmitClientOpResult;
};

export const useSubmitClientOpResultMutation = (): UseMutationResult<
  TAgentJobResponse,
  unknown,
  SubmitClientOpVariables
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, payload }: SubmitClientOpVariables) =>
      dataService.submitJobClientOpResult(jobId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries([QueryKeys.jobs]);
      if (data?.job?._id) {
        queryClient.setQueryData([QueryKeys.job, data.job._id], data);
        patchJobInListCache(queryClient, data.job);
      }
    },
  });
};
