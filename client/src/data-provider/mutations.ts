import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  FileUploadResponse,
  UploadMutationOptions,
  FileUploadBody,
  DeleteFilesResponse,
  DeleteFilesBody,
  DeleteMutationOptions,
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

export const useDeleteFilesMutation = (
  options?: DeleteMutationOptions,
): UseMutationResult<
  DeleteFilesResponse, // response data
  unknown, // error
  DeleteFilesBody, // request
  unknown // context
> => {
  return useMutation([MutationKeys.fileDelete], {
    mutationFn: (body: DeleteFilesBody) => dataService.deleteFiles(body.files),
    ...(options || {}),
  });
};
