import type * as t from 'librechat-data-provider';
import { useMutation, UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';

export const useUpdateFileMutation = (
  _options?: t.UpdateFileMutationOptions,
): UseMutationResult<t.TFile, unknown, t.UpdateFileMetadataBody, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, ...options } = _options || {};
  return useMutation([MutationKeys.fileUpdate], {
    mutationFn: (body: t.UpdateFileMetadataBody) => dataService.updateFile(body),
    ...options,
    onSuccess: (data, vars, context) => {
      queryClient.setQueryData<t.TFile[] | undefined>([QueryKeys.files], (files) =>
        (files ?? []).map((file) => (file.file_id === vars.file_id ? { ...file, ...data } : file)),
      );
      onSuccess?.(data, vars, context);
    },
    onError: (error, vars, context) => {
      onError?.(error, vars, context);
    },
  });
};
