import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  FileUploadResponse,
  UploadMutationOptions,
  FileUploadBody,
  DeleteFilesResponse,
  DeleteFilesBody,
  DeleteMutationOptions,
  UpdatePresetOptions,
  DeletePresetOptions,
  PresetDeleteResponse,
  TPreset,
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

export const useUpdatePresetMutation = (
  options?: UpdatePresetOptions,
): UseMutationResult<
  TPreset, // response data
  unknown,
  TPreset,
  unknown
> => {
  return useMutation([MutationKeys.updatePreset], {
    mutationFn: (preset: TPreset) => dataService.updatePreset(preset),
    ...(options || {}),
  });
};

export const useDeletePresetMutation = (
  options?: DeletePresetOptions,
): UseMutationResult<
  PresetDeleteResponse, // response data
  unknown,
  TPreset | undefined,
  unknown
> => {
  return useMutation([MutationKeys.deletePreset], {
    mutationFn: (preset: TPreset | undefined) => dataService.deletePreset(preset),
    ...(options || {}),
  });
};
