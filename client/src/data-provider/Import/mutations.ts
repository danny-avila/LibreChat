import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService, isImportJobStarted } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TImportResponse } from 'librechat-data-provider';

export const useUploadImportMutation = (options?: {
  onSuccess?: (data: TImportResponse) => void;
  onError?: (error: unknown) => void;
}): UseMutationResult<TImportResponse, unknown, FormData> => {
  const queryClient = useQueryClient();

  return useMutation<TImportResponse, unknown, FormData>({
    mutationFn: (formData: FormData) => dataService.importConversationsFile(formData),
    onSuccess: (data) => {
      if (!isImportJobStarted(data)) {
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      }
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

export const useStartImportMutation = (options?: {
  onError?: (error: unknown) => void;
}): UseMutationResult<{ jobId: string }, unknown, string> => {
  const queryClient = useQueryClient();

  return useMutation<{ jobId: string }, unknown, string>({
    mutationFn: (jobId: string) => dataService.startImportJob(jobId),
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries([QueryKeys.importJob, jobId]);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

export const useCancelImportMutation = (): UseMutationResult<
  { jobId: string },
  unknown,
  string
> => {
  const queryClient = useQueryClient();

  return useMutation<{ jobId: string }, unknown, string>({
    mutationFn: (jobId: string) => dataService.cancelImportJob(jobId),
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries([QueryKeys.importJob, jobId]);
    },
  });
};
