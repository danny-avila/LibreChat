import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  FileUploadResponse,
  UploadMutationOptions,
  FileUploadBody,
} from 'librechat-data-provider';
import { dataService, MutationKeys } from 'librechat-data-provider';

export const useUploadImageMutation = (
  options?: UploadMutationOptions,
): UseMutationResult<
  FileUploadResponse, // response data
  unknown, // error
  FileUploadBody, // request
  unknown // context
> => {
  return useMutation([MutationKeys.imageUpload], {
    mutationFn: (body: FileUploadBody) => dataService.uploadImage(body.formData),
    ...(options || {}),
  });
};
