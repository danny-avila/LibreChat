import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { FileUploadResponse, UploadMutationOptions } from 'librechat-data-provider';
import { dataService, MutationKeys } from 'librechat-data-provider';

export const useUploadImageMutation = (
  options?: UploadMutationOptions,
): UseMutationResult<
  FileUploadResponse, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  return useMutation([MutationKeys.imageUpload], {
    mutationFn: (fileData: FormData) => dataService.uploadImage(fileData),
    ...(options || {}),
  });
};
