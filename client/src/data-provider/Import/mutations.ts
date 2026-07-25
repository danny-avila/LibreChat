import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService, isImportJobStarted } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TImportResponse } from 'librechat-data-provider';

export type ImportJobActionResult = { jobId: string };

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
}): UseMutationResult<ImportJobActionResult, unknown, string> => {
  const queryClient = useQueryClient();

  return useMutation<ImportJobActionResult, unknown, string>({
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
  ImportJobActionResult,
  unknown,
  string
> => {
  const queryClient = useQueryClient();

  return useMutation<ImportJobActionResult, unknown, string>({
    mutationFn: (jobId: string) => dataService.cancelImportJob(jobId),
    onSuccess: (_data, jobId) => {
      /**
       * Cancellation stops the background job between conversations, not
       * before the first one: everything already flushed to the database
       * up to that point is a real, permanent import. The conversation
       * list must be invalidated alongside the job query, or the sidebar
       * never reflects what was actually imported before cancelling.
       */
      queryClient.invalidateQueries([QueryKeys.importJob, jobId]);
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};
