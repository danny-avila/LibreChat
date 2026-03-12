import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  TUserProject,
  UserProjectListResponse,
  UserProjectCreateParams,
  UserProjectUpdateParams,
} from 'librechat-data-provider';

export const useUserProjectsQuery = (
  params?: { search?: string },
  config?: UseQueryOptions<UserProjectListResponse>,
): QueryObserverResult<UserProjectListResponse> => {
  return useQuery<UserProjectListResponse>(
    [QueryKeys.userProjects, params?.search],
    () => dataService.getUserProjects(params),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useUserProjectQuery = (
  projectId: string,
  config?: UseQueryOptions<TUserProject>,
): QueryObserverResult<TUserProject> => {
  return useQuery<TUserProject>(
    [QueryKeys.userProject, projectId],
    () => dataService.getUserProjectById(projectId),
    {
      enabled: !!projectId,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useCreateUserProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (data: UserProjectCreateParams) => dataService.createUserProject(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.userProjects]);
      },
    },
  );
};

export const useUpdateUserProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ projectId, data }: { projectId: string; data: UserProjectUpdateParams }) =>
      dataService.updateUserProject(projectId, data),
    {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries([QueryKeys.userProjects]);
        queryClient.invalidateQueries([QueryKeys.userProject, variables.projectId]);
      },
    },
  );
};

export const useDeleteUserProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (projectId: string) => dataService.deleteUserProject(projectId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.userProjects]);
      },
    },
  );
};

export const useAssignConvoToProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ projectId, conversationId }: { projectId: string; conversationId: string }) =>
      dataService.assignConversationToProject(projectId, conversationId),
    {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries([QueryKeys.userProject, variables.projectId]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    },
  );
};

export const useRemoveConvoFromProjectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ projectId, conversationId }: { projectId: string; conversationId: string }) =>
      dataService.removeConversationFromProject(projectId, conversationId),
    {
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries([QueryKeys.userProject, variables.projectId]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    },
  );
};
