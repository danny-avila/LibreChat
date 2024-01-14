import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TFileUpload,
  UploadMutationOptions,
  FileUploadBody,
  DeleteFilesResponse,
  DeleteFilesBody,
  DeleteMutationOptions,
  UpdatePresetOptions,
  DeletePresetOptions,
  PresetDeleteResponse,
  LogoutOptions,
  TPreset,
  UploadAvatarOptions,
  AvatarUploadResponse,
} from 'librechat-data-provider';

import { dataService, MutationKeys } from 'librechat-data-provider';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

export const useUploadImageMutation = (
  options?: UploadMutationOptions,
): UseMutationResult<
  TFileUpload, // response data
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

/* login/logout */
export const useLogoutUserMutation = (
  options?: LogoutOptions,
): UseMutationResult<unknown, unknown, undefined, unknown> => {
  const queryClient = useQueryClient();
  const setDefaultPreset = useSetRecoilState(store.defaultPreset);
  return useMutation([MutationKeys.logoutUser], {
    mutationFn: () => dataService.logout(),

    ...(options || {}),
    onSuccess: (...args) => {
      options?.onSuccess?.(...args);
    },
    onMutate: (...args) => {
      setDefaultPreset(null);
      queryClient.removeQueries();
      localStorage.removeItem('lastConversationSetup');
      localStorage.removeItem('lastSelectedModel');
      localStorage.removeItem('lastSelectedTools');
      localStorage.removeItem('filesToDelete');
      localStorage.removeItem('lastAssistant');
      options?.onMutate?.(...args);
    },
  });
};

/* Avatar upload */
export const useUploadAvatarMutation = (
  options?: UploadAvatarOptions,
): UseMutationResult<
  AvatarUploadResponse, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  return useMutation([MutationKeys.avatarUpload], {
    mutationFn: (variables: FormData) => dataService.uploadAvatar(variables),
    ...(options || {}),
  });
};
