import { useRecoilCallback } from 'recoil';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TChatProject,
  TConversation,
  TCreateChatProjectRequest,
  TDeleteChatProjectResponse,
  TUpdateChatProjectRequest,
  TAssignConversationToProjectRequest,
  TAssignConversationToProjectResponse,
} from 'librechat-data-provider';
import store from '~/store';

export const useCreateProjectMutation = (): UseMutationResult<
  TChatProject,
  unknown,
  TCreateChatProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TCreateChatProjectRequest) => dataService.createProject(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.projects]);
    },
  });
};

export const useUpdateProjectMutation = (): UseMutationResult<
  TChatProject,
  unknown,
  TUpdateChatProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TUpdateChatProjectRequest) => dataService.updateProject(payload), {
    onSuccess: (project) => {
      queryClient.setQueryData([QueryKeys.project, project._id], project);
      queryClient.invalidateQueries([QueryKeys.projects]);
    },
  });
};

export const useDeleteProjectMutation = (): UseMutationResult<
  TDeleteChatProjectResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  const clearActiveConversationProject = useRecoilCallback(
    ({ snapshot, set }) =>
      async (projectId: string) => {
        const conversation = await snapshot.getPromise(store.conversationByIndex(0));
        if (conversation?.conversationId && conversation.chatProjectId === projectId) {
          set(store.updateConversationSelector(conversation.conversationId), {
            ...conversation,
            chatProjectId: null,
          });
        }
      },
    [],
  );
  return useMutation((projectId: string) => dataService.deleteProject(projectId), {
    onSuccess: (_result, projectId) => {
      clearActiveConversationProject(projectId);
      queryClient.removeQueries([QueryKeys.project, projectId]);
      queryClient.invalidateQueries([QueryKeys.projects]);
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useAssignConversationToProjectMutation = (): UseMutationResult<
  TAssignConversationToProjectResponse,
  unknown,
  TAssignConversationToProjectRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  const updateActiveConversation = useRecoilCallback(
    ({ set }) =>
      (conversation: TConversation) => {
        if (!conversation.conversationId) {
          return;
        }
        set(store.updateConversationSelector(conversation.conversationId), {
          ...conversation,
          chatProjectId: conversation.chatProjectId ?? null,
        });
      },
    [],
  );

  return useMutation(
    (payload: TAssignConversationToProjectRequest) =>
      dataService.assignConversationToProject(payload),
    {
      onSuccess: (result) => {
        updateActiveConversation(result.conversation);
        queryClient.setQueryData(
          [QueryKeys.conversation, result.conversation.conversationId],
          result.conversation,
        );
        [result.previousProjectId, result.projectId].forEach((projectId) => {
          if (projectId) {
            queryClient.invalidateQueries([QueryKeys.project, projectId]);
          }
        });
        queryClient.invalidateQueries([QueryKeys.projects]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
        queryClient.invalidateQueries([QueryKeys.projectConversations]);
      },
    },
  );
};
