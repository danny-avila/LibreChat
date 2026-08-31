import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useCreateSkillNodeMutation = (
  skillId: string,
  options?: t.CreateSkillNodeOptions,
): UseMutationResult<t.TSkillNode, Error, t.CreateSkillNodeBody> => {
  const queryClient = useQueryClient();
  return useMutation(
    (body: t.CreateSkillNodeBody) => dataService.createSkillNode(body.skillId, body.data),
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (newNode, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.skillTree, skillId]);
        return options?.onSuccess?.(newNode, variables, context);
      },
    },
  );
};

export const useUpdateSkillNodeMutation = (
  skillId: string,
  options?: t.UpdateSkillNodeOptions,
): UseMutationResult<t.TSkillNode, Error, t.UpdateSkillNodeVariables> => {
  const queryClient = useQueryClient();
  return useMutation((vars: t.UpdateSkillNodeVariables) => dataService.updateSkillNode(vars), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (updated, variables, context) => {
      queryClient.invalidateQueries([QueryKeys.skillTree, skillId]);
      queryClient.invalidateQueries([QueryKeys.skillNodeContent, skillId, variables.nodeId]);
      return options?.onSuccess?.(updated, variables, context);
    },
  });
};

export const useDeleteSkillNodeMutation = (
  skillId: string,
  options?: t.DeleteSkillNodeOptions,
): UseMutationResult<void, Error, t.DeleteSkillNodeBody> => {
  const queryClient = useQueryClient();
  return useMutation((vars: t.DeleteSkillNodeBody) => dataService.deleteSkillNode(vars), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (result, variables, context) => {
      queryClient.invalidateQueries([QueryKeys.skillTree, skillId]);
      return options?.onSuccess?.(result, variables, context);
    },
  });
};

export const useUpdateSkillNodeContentMutation = (
  skillId: string,
  options?: t.UpdateSkillNodeContentOptions,
): UseMutationResult<t.TSkillNode, Error, t.UpdateSkillNodeContentVariables> => {
  const queryClient = useQueryClient();
  return useMutation(
    (vars: t.UpdateSkillNodeContentVariables) => dataService.updateSkillNodeContent(vars),
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (updated, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.skillNodeContent, skillId, variables.nodeId]);
        return options?.onSuccess?.(updated, variables, context);
      },
    },
  );
};
