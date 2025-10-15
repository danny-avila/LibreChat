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
} from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

export const useGetRole = (
  roleName: string,
  config?: UseQueryOptions<t.TRole>,
): QueryObserverResult<t.TRole> => {
  return useQuery<t.TRole>([QueryKeys.roles, roleName], () => dataService.getRole(roleName), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useUpdatePromptPermissionsMutation = (
  options?: t.UpdatePromptPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePromptPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePromptPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update prompt permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateAgentPermissionsMutation = (
  options?: t.UpdateAgentPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateAgentPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      promptPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateAgentPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess != null) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update prompt permissions:', error);
        }
        if (onError != null) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMemoryPermissionsMutation = (
  options?: t.UpdateMemoryPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMemoryPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      memoryPermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMemoryPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update memory permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdatePeoplePickerPermissionsMutation = (
  options?: t.UpdatePeoplePickerPermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdatePeoplePickerPermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      peoplePickerPermissionsSchema.partial().parse(variables.updates);
      return dataService.updatePeoplePickerPermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update people picker permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};

export const useUpdateMarketplacePermissionsMutation = (
  options?: t.UpdateMarketplacePermOptions,
): UseMutationResult<
  t.UpdatePermResponse,
  t.TError | undefined,
  t.UpdateMarketplacePermVars,
  unknown
> => {
  const queryClient = useQueryClient();
  const { onMutate, onSuccess, onError } = options ?? {};
  return useMutation(
    (variables) => {
      marketplacePermissionsSchema.partial().parse(variables.updates);
      return dataService.updateMarketplacePermissions(variables);
    },
    {
      onSuccess: (data, variables, context) => {
        queryClient.invalidateQueries([QueryKeys.roles, variables.roleName]);
        if (onSuccess) {
          onSuccess(data, variables, context);
        }
      },
      onError: (...args) => {
        const error = args[0];
        if (error != null) {
          console.error('Failed to update marketplace permissions:', error);
        }
        if (onError) {
          onError(...args);
        }
      },
      onMutate,
    },
  );
};
