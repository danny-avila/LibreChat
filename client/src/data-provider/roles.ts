import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  dataService,
  promptPermissionsSchema,
  memoryPermissionsSchema,
  marketplacePermissionsSchema,
  peoplePickerPermissionsSchema,
} from 'librechat-data-provider';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
  UseMutationOptions,
} from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useGetRole = (
  roleName: string,
  config?: UseQueryOptions<t.TRole>,
): QueryObserverResult<t.TRole> => {
  return useQuery({
    queryKey: [QueryKeys.roles, roleName],
    queryFn: () => dataService.getRole(roleName),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useUpdatePromptPermissionsMutation = (
  options?: UseMutationOptions<t.UpdatePermResponse, t.TError | undefined, t.UpdatePromptPermVars, unknown>,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePromptPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation({
    mutationFn: (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePromptPermissions(variables);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.roles, variables.roleName]
      });
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (error != null) {
        console.error('Failed to update prompt permissions:', error);
      }
      onError?.(error, variables, onMutateResult, context);
    },
    onMutate,
  });
};

export const useUpdateAgentPermissionsMutation = (
  options?: UseMutationOptions<t.UpdatePermResponse, t.TError | undefined, t.UpdateAgentPermVars, unknown>,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateAgentPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation({
    mutationFn: (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateAgentPermissions(variables);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.roles, variables.roleName]
      });
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (error != null) {
        console.error('Failed to update prompt permissions:', error);
      }
      onError?.(error, variables, onMutateResult, context);
    },
    onMutate,
  });
};

export const useUpdateMemoryPermissionsMutation = (
  options?: UseMutationOptions<t.UpdatePermResponse, t.TError | undefined, t.UpdateMemoryPermVars, unknown>,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMemoryPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation({
    mutationFn: (variables) => {
      memoryPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMemoryPermissions(variables);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.roles, variables.roleName]
      });
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (error != null) {
        console.error('Failed to update memory permissions:', error);
      }
      onError?.(error, variables, onMutateResult, context);
    },
    onMutate,
  });
};

export const useUpdatePeoplePickerPermissionsMutation = (
  options?: UseMutationOptions<t.UpdatePermResponse, t.TError | undefined, t.UpdatePeoplePickerPermVars, unknown>,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePeoplePickerPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation({
    mutationFn: (variables) => {
      peoplePickerPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePeoplePickerPermissions(variables);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.roles, variables.roleName]
      });
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (error != null) {
        console.error('Failed to update people picker permissions:', error);
      }
      onError?.(error, variables, onMutateResult, context);
    },
    onMutate,
  });
};

export const useUpdateMarketplacePermissionsMutation = (
  options?: UseMutationOptions<t.UpdatePermResponse, t.TError | undefined, t.UpdateMarketplacePermVars, unknown>,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMarketplacePermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation({
    mutationFn: (variables) => {
      marketplacePermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMarketplacePermissions(variables);
    },
    onSuccess: (data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.roles, variables.roleName]
      });
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (error != null) {
        console.error('Failed to update marketplace permissions:', error);
      }
      onError?.(error, variables, onMutateResult, context);
    },
    onMutate,
  });
};
