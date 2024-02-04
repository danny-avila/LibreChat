import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
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
  TConversation,
} from 'librechat-data-provider';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import { updateConversation, deleteConversation, updateConvoFields } from '~/utils';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

/** Conversations */
export const useGenTitleMutation = (): UseMutationResult<
  t.TGenTitleResponse,
  unknown,
  t.TGenTitleRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TGenTitleRequest) => dataService.genTitle(payload), {
    onSuccess: (response, vars) => {
      queryClient.setQueryData(
        [QueryKeys.conversation, vars.conversationId],
        (convo: TConversation | undefined) => {
          if (!convo) {
            return convo;
          }
          return { ...convo, title: response.title };
        },
      );
      queryClient.setQueryData<t.ConversationData>([QueryKeys.allConversations], (convoData) => {
        if (!convoData) {
          return convoData;
        }
        return updateConvoFields(convoData, {
          conversationId: vars.conversationId,
          title: response.title,
        } as TConversation);
      });
    },
  });
};

export const useUpdateConversationMutation = (
  id: string,
): UseMutationResult<
  t.TUpdateConversationResponse,
  unknown,
  t.TUpdateConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TUpdateConversationRequest) => dataService.updateConversation(payload),
    {
      onSuccess: (updatedConvo) => {
        queryClient.setQueryData([QueryKeys.conversation, id], updatedConvo);
        queryClient.setQueryData<t.ConversationData>([QueryKeys.allConversations], (convoData) => {
          if (!convoData) {
            return convoData;
          }
          return updateConversation(convoData, updatedConvo);
        });
      },
    },
  );
};

export const useDeleteConversationMutation = (
  id?: string,
): UseMutationResult<
  t.TDeleteConversationResponse,
  unknown,
  t.TDeleteConversationRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: t.TDeleteConversationRequest) => dataService.deleteConversation(payload),
    {
      onSuccess: () => {
        if (!id) {
          return;
        }
        queryClient.setQueryData([QueryKeys.conversation, id], null);
        queryClient.setQueryData<t.ConversationData>([QueryKeys.allConversations], (convoData) => {
          if (!convoData) {
            return convoData;
          }
          const update = deleteConversation(convoData, id);
          return update;
        });
      },
    },
  );
};

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
