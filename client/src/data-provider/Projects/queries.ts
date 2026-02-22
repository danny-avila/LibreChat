import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  UserProjectsResponse,
  MemoryDocumentsResponse,
  CreateUserProjectBody,
  UpdateUserProjectBody,
  UpdateMemoryDocumentBody,
} from 'librechat-data-provider';

export const useUserProjects = () => {
  return useQuery<UserProjectsResponse>({
    queryKey: [QueryKeys.userProjects],
    queryFn: () => dataService.getUserProjects(),
  });
};

export const useCreateUserProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.createUserProject],
    mutationFn: (data: CreateUserProjectBody) => dataService.createUserProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.userProjects] });
    },
  });
};

export const useUpdateUserProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.updateUserProject],
    mutationFn: ({ id, data }: { id: string; data: UpdateUserProjectBody }) =>
      dataService.updateUserProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.userProjects] });
    },
  });
};

export const useDeleteUserProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.deleteUserProject],
    mutationFn: (id: string) => dataService.deleteUserProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.userProjects] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.memoryDocuments] });
    },
  });
};

export const useMemoryDocuments = () => {
  return useQuery<MemoryDocumentsResponse>({
    queryKey: [QueryKeys.memoryDocuments],
    queryFn: () => dataService.getMemoryDocuments(),
  });
};

export const useUpdateMemoryDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.updateMemoryDocument],
    mutationFn: ({
      scope,
      projectId,
      data,
    }: {
      scope: string;
      projectId?: string;
      data: UpdateMemoryDocumentBody;
    }) => dataService.updateMemoryDocument(scope, projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.memoryDocuments] });
    },
  });
};

export const useAssignConversationProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.assignConversationProject],
    mutationFn: ({
      conversationId,
      projectId,
    }: {
      conversationId: string;
      projectId: string | null;
    }) => dataService.assignConversationProject(conversationId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.allConversations] });
    },
  });
};
