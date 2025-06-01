import { useRecoilValue } from 'recoil';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import {
  /* Prompts */
  addGroupToAll,
  addPromptGroup,
  updateGroupInAll,
  updateGroupFields,
  deletePromptGroup,
  removeGroupFromAll,
} from '~/utils';
import store from '~/store';

export const useUpdatePromptGroup = (
  options?: t.UpdatePromptGroupOptions,
): UseMutationResult<
  t.TUpdatePromptGroupResponse,
  unknown,
  t.TUpdatePromptGroupVariables,
  unknown
> => {
  const { onMutate, onError, onSuccess } = options || {};
  const queryClient = useQueryClient();
  const name = useRecoilValue(store.promptsName);
  const pageSize = useRecoilValue(store.promptsPageSize);
  const category = useRecoilValue(store.promptsCategory);

  return useMutation({
    mutationFn: (variables: t.TUpdatePromptGroupVariables) =>
      dataService.updatePromptGroup(variables),
    onMutate: (variables: t.TUpdatePromptGroupVariables) => {
      const groupData = queryClient.getQueryData<t.TPromptGroup>([
        QueryKeys.promptGroup,
        variables.id,
      ]);
      const group = groupData ? structuredClone(groupData) : undefined;

      const groupListData = queryClient.getQueryData<t.PromptGroupListData>([
        QueryKeys.promptGroups,
        name,
        category,
        pageSize,
      ]);
      const previousListData = groupListData ? structuredClone(groupListData) : undefined;

      let update = variables.payload;
      if (update.removeProjectIds && group?.projectIds) {
        update = structuredClone(update);
        update.projectIds = group.projectIds.filter((id) => !update.removeProjectIds?.includes(id));
        delete update.removeProjectIds;
      }

      if (groupListData) {
        const newData = updateGroupFields(
          /* Paginated Data */
          groupListData,
          /* Update */
          { _id: variables.id, ...update },
          /* Callback */
          (group) => queryClient.setQueryData([QueryKeys.promptGroup, variables.id], group),
        );
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          newData,
        );
      }

      if (onMutate) {
        onMutate(variables);
      }

      return { group, previousListData };
    },
    onError: (err, variables, context) => {
      if (context?.group) {
        queryClient.setQueryData([QueryKeys.promptGroups, variables.id], context.group);
      }
      if (context?.previousListData) {
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          context.previousListData,
        );
      }
      if (onError) {
        onError(err, variables, context);
      }
    },
    onSuccess: (response, variables, context) => {
      updateGroupInAll(queryClient, { _id: variables.id, ...response });
      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useCreatePrompt = (
  options?: t.CreatePromptOptions,
): UseMutationResult<t.TCreatePromptResponse, unknown, t.TCreatePrompt, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options || {};
  const name = useRecoilValue(store.promptsName);
  const pageSize = useRecoilValue(store.promptsPageSize);
  const category = useRecoilValue(store.promptsCategory);

  return useMutation({
    mutationFn: (payload: t.TCreatePrompt) => dataService.createPrompt(payload),
    ...rest,
    onSuccess: (response, variables, context) => {
      const { prompt, group } = response;
      queryClient.setQueryData(
        [QueryKeys.prompts, variables.prompt.groupId],
        (oldData: t.TPrompt[] | undefined) => {
          return [prompt, ...(oldData ?? [])];
        },
      );

      if (group) {
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          (data) => {
            if (!data) {
              return data;
            }
            return addPromptGroup(data, group);
          },
        );

        addGroupToAll(queryClient, group);
      }

      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useDeletePrompt = (
  options?: t.DeletePromptOptions,
): UseMutationResult<t.TDeletePromptResponse, unknown, t.TDeletePromptVariables, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options || {};
  const name = useRecoilValue(store.promptsName);
  const pageSize = useRecoilValue(store.promptsPageSize);
  const category = useRecoilValue(store.promptsCategory);

  return useMutation({
    mutationFn: (payload: t.TDeletePromptVariables) => dataService.deletePrompt(payload),
    ...rest,
    onSuccess: (response, variables, context) => {
      if (response.promptGroup) {
        const promptGroupId = response.promptGroup.id;
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          (data) => {
            if (!data) {
              return data;
            }
            return deletePromptGroup(data, promptGroupId);
          },
        );

        removeGroupFromAll(queryClient, promptGroupId);
      } else {
        queryClient.setQueryData<t.TPrompt[]>(
          [QueryKeys.prompts, variables.groupId],
          (oldData?: t.TPrompt[]) => {
            const prompts = oldData ? oldData.filter((prompt) => prompt._id !== variables._id) : [];
            queryClient.setQueryData<t.TPromptGroup>(
              [QueryKeys.promptGroup, variables.groupId],
              (data) => {
                if (!data) {
                  return data;
                }
                if (data.productionId === variables._id) {
                  data.productionId = prompts[0]._id;
                  data.productionPrompt = prompts[0];
                }
              },
            );
            return prompts;
          },
        );
      }
      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useDeletePromptGroup = (
  options?: t.DeletePromptGroupOptions,
): UseMutationResult<
  t.TDeletePromptGroupResponse,
  unknown,
  t.TDeletePromptGroupRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...rest } = options || {};
  const name = useRecoilValue(store.promptsName);
  const pageSize = useRecoilValue(store.promptsPageSize);
  const category = useRecoilValue(store.promptsCategory);

  return useMutation({
    mutationFn: (variables: t.TDeletePromptGroupRequest) =>
      dataService.deletePromptGroup(variables.id),
    ...rest,
    onSuccess: (response, variables, context) => {
      queryClient.setQueryData<t.PromptGroupListData>(
        [QueryKeys.promptGroups, name, category, pageSize],
        (data) => {
          if (!data) {
            return data;
          }

          return deletePromptGroup(data, variables.id);
        },
      );

      removeGroupFromAll(queryClient, variables.id);
      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useUpdatePromptLabels = (
  options?: t.UpdatePromptLabelOptions,
): UseMutationResult<
  t.TUpdatePromptLabelsResponse,
  unknown,
  t.TUpdatePromptLabelsRequest,
  unknown
> => {
  const { onSuccess, ...rest } = options || {};
  return useMutation({
    mutationFn: (variables: t.TUpdatePromptLabelsRequest) =>
      dataService.updatePromptLabels(variables),
    ...rest,
    onSuccess: (response, variables, context) => {
      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useMakePromptProduction = (options?: t.MakePromptProductionOptions) => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate } = options || {};
  const name = useRecoilValue(store.promptsName);
  const pageSize = useRecoilValue(store.promptsPageSize);
  const category = useRecoilValue(store.promptsCategory);

  return useMutation({
    mutationFn: (variables: t.TMakePromptProductionRequest) =>
      dataService.makePromptProduction(variables.id),
    onMutate: (variables: t.TMakePromptProductionRequest) => {
      const group = JSON.parse(
        JSON.stringify(
          queryClient.getQueryData<t.TPromptGroup>([QueryKeys.promptGroup, variables.groupId]),
        ),
      ) as t.TPromptGroup;
      const groupData = queryClient.getQueryData<t.PromptGroupListData>([
        QueryKeys.promptGroups,
        name,
        category,
        pageSize,
      ]);
      const previousListData = JSON.parse(JSON.stringify(groupData)) as t.PromptGroupListData;

      if (groupData) {
        const newData = updateGroupFields(
          /* Paginated Data */
          groupData,
          /* Update */
          {
            _id: variables.groupId,
            productionId: variables.id,
            productionPrompt: variables.productionPrompt,
          },
          /* Callback */
          (group) => queryClient.setQueryData([QueryKeys.promptGroup, variables.groupId], group),
        );
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          newData,
        );
      }

      if (onMutate) {
        onMutate(variables);
      }

      return { group, previousListData };
    },
    onError: (err, variables, context) => {
      if (context?.group) {
        queryClient.setQueryData([QueryKeys.promptGroups, variables.groupId], context.group);
      }
      if (context?.previousListData) {
        queryClient.setQueryData<t.PromptGroupListData>(
          [QueryKeys.promptGroups, name, category, pageSize],
          context.previousListData,
        );
      }
      if (onError) {
        onError(err, variables, context);
      }
    },
    onSuccess: (response, variables, context) => {
      updateGroupInAll(queryClient, {
        _id: variables.groupId,
        productionId: variables.id,
        productionPrompt: variables.productionPrompt,
      });
      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

/* Prompt Favorites and Rankings */
export const useTogglePromptFavorite = (
  options?: t.UpdatePromptGroupOptions,
): UseMutationResult<t.TPromptFavoriteResponse, unknown, { groupId: string }, unknown> => {
  const { onMutate, onError, onSuccess } = options || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { groupId: string }) =>
      dataService.togglePromptFavorite(variables.groupId),
    onMutate: async (variables: { groupId: string }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [QueryKeys.promptGroups] });
      await queryClient.cancelQueries({ queryKey: [QueryKeys.userPromptPreferences] });

      // Snapshot the previous values
      const previousPreferences = queryClient.getQueryData<t.TGetUserPromptPreferencesResponse>([
        QueryKeys.userPromptPreferences,
      ]);

      // Optimistically update the favorites
      if (previousPreferences) {
        const isFavorite = previousPreferences.favorites.includes(variables.groupId);
        const newFavorites = isFavorite
          ? previousPreferences.favorites.filter((id) => id !== variables.groupId)
          : [...previousPreferences.favorites, variables.groupId];

        queryClient.setQueryData<t.TGetUserPromptPreferencesResponse>(
          [QueryKeys.userPromptPreferences],
          {
            ...previousPreferences,
            favorites: newFavorites,
          },
        );
      }

      if (onMutate) {
        return onMutate(variables);
      }

      return { previousPreferences };
    },
    onError: (err, variables, context) => {
      // Revert optimistic update on error
      if (context?.previousPreferences) {
        queryClient.setQueryData([QueryKeys.userPromptPreferences], context.previousPreferences);
      }
      if (onError) {
        onError(err, variables, context);
      }
    },
    onSuccess: (response, variables, context) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: [QueryKeys.userPromptPreferences] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.promptGroups] });

      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useUpdatePromptRankings = (
  options?: t.UpdatePromptGroupOptions,
): UseMutationResult<t.TPromptRankingResponse, unknown, t.TPromptRankingRequest, unknown> => {
  const { onMutate, onError, onSuccess } = options || {};
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: t.TPromptRankingRequest) => dataService.updatePromptRankings(variables),
    onMutate: async (variables: t.TPromptRankingRequest) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [QueryKeys.userPromptPreferences] });

      // Snapshot the previous values
      const previousPreferences = queryClient.getQueryData<t.TGetUserPromptPreferencesResponse>([
        QueryKeys.userPromptPreferences,
      ]);

      // Optimistically update the rankings
      if (previousPreferences) {
        queryClient.setQueryData<t.TGetUserPromptPreferencesResponse>(
          [QueryKeys.userPromptPreferences],
          {
            ...previousPreferences,
            rankings: variables.rankings,
          },
        );
      }

      if (onMutate) {
        return onMutate(variables);
      }

      return { previousPreferences };
    },
    onError: (err, variables, context) => {
      // Revert optimistic update on error
      if (context?.previousPreferences) {
        queryClient.setQueryData([QueryKeys.userPromptPreferences], context.previousPreferences);
      }
      if (onError) {
        onError(err, variables, context);
      }
    },
    onSuccess: (response, variables, context) => {
      // Don't automatically invalidate queries to prevent infinite loops
      // The optimistic update in onMutate handles the UI update
      // Manual invalidation can be done by components when needed

      if (onSuccess) {
        onSuccess(response, variables, context);
      }
    },
  });
};

export const useGetUserPromptPreferences = () => {
  return useQuery({
    queryKey: [QueryKeys.userPromptPreferences],
    queryFn: () => dataService.getUserPromptPreferences(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchOnMount: false, // Prevent refetch on component mount
  });
};
