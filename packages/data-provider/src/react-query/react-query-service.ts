import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  UseQueryOptions,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import { Constants, initialModelsConfig } from '../config';
import { defaultOrderQuery } from '../types/assistants';
import { MCPServerConnectionStatusResponse } from '../types/queries';
import * as dataService from '../data-service';
import * as m from '../types/mutations';
import * as q from '../types/queries';
import { QueryKeys } from '../keys';
import * as s from '../schemas';
import * as t from '../types';
import * as permissions from '../accessPermissions';
import { ResourceType } from '../accessPermissions';

export { hasPermissions } from '../accessPermissions';

export const useGetSharedMessages = (
  shareId: string,
  config?: UseQueryOptions<t.TSharedMessagesResponse>,
): QueryObserverResult<t.TSharedMessagesResponse> => {
  return useQuery({
    queryKey: [QueryKeys.sharedMessages, shareId],
    queryFn: () => dataService.getSharedMessages(shareId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config
  });
};

export const useGetSharedLinkQuery = (
  conversationId: string,
  config?: UseQueryOptions<t.TSharedLinkGetResponse>,
): QueryObserverResult<t.TSharedLinkGetResponse> => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [QueryKeys.sharedLinks, conversationId],
    queryFn: () => dataService.getSharedLink(conversationId),

    enabled:
      !!conversationId &&
      conversationId !== Constants.NEW_CONVO &&
      conversationId !== Constants.PENDING_CONVO,

    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    onSuccess: (data) => {
      queryClient.setQueryData([QueryKeys.sharedLinks, conversationId], {
        conversationId: data.conversationId,
        shareId: data.shareId,
      });
    },

    ...config
  });
};

export const useGetConversationByIdQuery = (
  id: string,
  config?: UseQueryOptions<s.TConversation>,
): QueryObserverResult<s.TConversation> => {
  return useQuery({
    queryKey: [QueryKeys.conversation, id],
    queryFn: () => dataService.getConversationById(id),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config
  });
};

//This isn't ideal because its just a query and we're using mutation, but it was the only way
//to make it work with how the Chat component is structured
export const useGetConversationByIdMutation = (id: string): UseMutationResult<s.TConversation> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.getConversationById(id),

    // onSuccess: (res: s.TConversation) => {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.conversation, id]
      });
    }
  });
};

export const useUpdateMessageMutation = (
  id: string,
): UseMutationResult<unknown, unknown, t.TUpdateMessageRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TUpdateMessageRequest) => dataService.updateMessage(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.messages, id]
      });
    }
  });
};

export const useUpdateMessageContentMutation = (
  conversationId: string,
): UseMutationResult<unknown, unknown, t.TUpdateMessageContent, unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TUpdateMessageContent) => dataService.updateMessageContent(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.messages, conversationId]
      });
    }
  });
};

export const useUpdateUserKeysMutation = (): UseMutationResult<
  t.TUser,
  unknown,
  t.TUpdateUserKeyRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TUpdateUserKeyRequest) => dataService.updateUserKey(payload),

    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.name, variables.name]
      });
    }
  });
};

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.clearAllConversations(),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.allConversations]
      });
    }
  });
};

export const useRevokeUserKeyMutation = (name: string): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.revokeUserKey(name),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.name, name]
      });
      if (s.isAssistantsEndpoint(name)) {
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.assistants, name, defaultOrderQuery]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.assistantDocs]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.assistants]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.assistant]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.mcpTools]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.actions]
        });
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.tools]
        });
      }
    }
  });
};

export const useRevokeAllUserKeysMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataService.revokeAllUserKeys(),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.name]
      });
      queryClient.invalidateQueries({
        queryKey: [
          QueryKeys.assistants,
          s.EModelEndpoint.assistants,
          defaultOrderQuery,
        ]
      });
      queryClient.invalidateQueries({
        queryKey: [
          QueryKeys.assistants,
          s.EModelEndpoint.azureAssistants,
          defaultOrderQuery,
        ]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.assistantDocs]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.assistants]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.assistant]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.mcpTools]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.actions]
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.tools]
      });
    }
  });
};

export const useGetModelsQuery = (
  config?: UseQueryOptions<t.TModelsConfig>,
): QueryObserverResult<t.TModelsConfig> => {
  return useQuery({
    queryKey: [QueryKeys.models],
    queryFn: () => dataService.getModels(),
    initialData: initialModelsConfig,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: Infinity,
    ...config
  });
};

export const useCreatePresetMutation = (): UseMutationResult<
  s.TPreset,
  unknown,
  s.TPreset,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: s.TPreset) => dataService.createPreset(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.presets]
      });
    }
  });
};

export const useDeletePresetMutation = (): UseMutationResult<
  m.PresetDeleteResponse,
  unknown,
  s.TPreset | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: s.TPreset | undefined) => dataService.deletePreset(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.presets]
      });
    }
  });
};

export const useUpdateTokenCountMutation = (): UseMutationResult<
  t.TUpdateTokenCountResponse,
  unknown,
  { text: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ text }: { text: string }) => dataService.updateTokenCount(text),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.tokenCount]
      });
    }
  });
};

export const useRegisterUserMutation = (
  options?: m.RegistrationOptions,
): UseMutationResult<t.TError, unknown, t.TRegisterUser, unknown> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TRegisterUser) => dataService.register(payload),
    ...options,

    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.user]
      });
      if (options?.onSuccess) {
        options.onSuccess(...args);
      }
    }
  });
};

export const useUserKeyQuery = (
  name: string,
  config?: UseQueryOptions<t.TCheckUserKeyResponse>,
): QueryObserverResult<t.TCheckUserKeyResponse> => {
  return useQuery({
    queryKey: [QueryKeys.name, name],

    queryFn: () => {
      if (!name) {
        return Promise.resolve({ expiresAt: '' });
      }
      return dataService.userKeyQuery(name);
    },

    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config
  });
};

export const useRequestPasswordResetMutation = (): UseMutationResult<
  t.TRequestPasswordResetResponse,
  unknown,
  t.TRequestPasswordReset,
  unknown
> => {
  return useMutation({
    mutationFn: (payload: t.TRequestPasswordReset) =>
      dataService.requestPasswordReset(payload)
  });
};

export const useResetPasswordMutation = (): UseMutationResult<
  unknown,
  unknown,
  t.TResetPassword,
  unknown
> => {
  return useMutation({
    mutationFn: (payload: t.TResetPassword) => dataService.resetPassword(payload)
  });
};

export const useAvailablePluginsQuery = <TData = s.TPlugin[]>(
  config?: UseQueryOptions<s.TPlugin[], unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery({
    queryKey: [QueryKeys.availablePlugins],
    queryFn: () => dataService.getAvailablePlugins(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config
  });
};

export const useUpdateUserPluginsMutation = (
  _options?: m.UpdatePluginAuthOptions,
): UseMutationResult<t.TUser, unknown, t.TUpdateUserPlugins, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options ?? {};
  return useMutation({
    mutationFn: (payload: t.TUpdateUserPlugins) => dataService.updateUserPlugins(payload),
    ...options,

    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.user]
      });
      onSuccess?.(...args);
      if (args[1]?.action === 'uninstall' && args[1]?.pluginKey?.startsWith(Constants.mcp_prefix)) {
        const serverName = args[1]?.pluginKey?.substring(Constants.mcp_prefix.length);
        queryClient.invalidateQueries({
          queryKey: [QueryKeys.mcpAuthValues, serverName]
        });
      }
    }
  });
};

export const useReinitializeMCPServerMutation = (): UseMutationResult<
  {
    success: boolean;
    message: string;
    serverName: string;
    oauthRequired?: boolean;
    oauthUrl?: string;
  },
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverName: string) => dataService.reinitializeMCPServer(serverName),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.mcpTools]
      });
    }
  });
};

export const useCancelMCPOAuthMutation = (): UseMutationResult<
  m.CancelMCPOAuthResponse,
  unknown,
  string,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverName: string) => dataService.cancelMCPOAuth(serverName),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.mcpConnectionStatus]
      });
    }
  });
};

export const useGetCustomConfigSpeechQuery = (
  config?: UseQueryOptions<t.TCustomConfigSpeechResponse>,
): QueryObserverResult<t.TCustomConfigSpeechResponse> => {
  return useQuery({
    queryKey: [QueryKeys.customConfigSpeech],
    queryFn: () => dataService.getCustomConfigSpeech(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config
  });
};

export const useUpdateFeedbackMutation = (
  conversationId: string,
  messageId: string,
): UseMutationResult<t.TUpdateFeedbackResponse, Error, t.TUpdateFeedbackRequest> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: t.TUpdateFeedbackRequest) =>
      dataService.updateFeedback(conversationId, messageId, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.messages, messageId]
      });
    }
  });
};

export const useSearchPrincipalsQuery = (
  params: q.PrincipalSearchParams,
  config?: UseQueryOptions<q.PrincipalSearchResponse>,
): QueryObserverResult<q.PrincipalSearchResponse> => {
  return useQuery({
    queryKey: [QueryKeys.principalSearch, params],
    queryFn: () => dataService.searchPrincipals(params),
    enabled: !!params.q && params.q.length >= 2,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    staleTime: 30000,
    ...config
  });
};

export const useGetAccessRolesQuery = (
  resourceType: ResourceType,
  config?: UseQueryOptions<q.AccessRolesResponse>,
): QueryObserverResult<q.AccessRolesResponse> => {
  return useQuery({
    queryKey: [QueryKeys.accessRoles, resourceType],
    queryFn: () => dataService.getAccessRoles(resourceType),
    enabled: !!resourceType,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    // Cache for 5 minutes
    staleTime: 5 * 60 * 1000,

    ...config
  });
};

export const useGetResourcePermissionsQuery = (
  resourceType: ResourceType,
  resourceId: string,
  config?: UseQueryOptions<permissions.TGetResourcePermissionsResponse>,
): QueryObserverResult<permissions.TGetResourcePermissionsResponse> => {
  return useQuery({
    queryKey: [QueryKeys.resourcePermissions, resourceType, resourceId],
    queryFn: () => dataService.getResourcePermissions(resourceType, resourceId),
    enabled: !!resourceType && !!resourceId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    // Cache for 2 minutes
    staleTime: 2 * 60 * 1000,

    ...config
  });
};

export const useUpdateResourcePermissionsMutation = (): UseMutationResult<
  permissions.TUpdateResourcePermissionsResponse,
  Error,
  {
    resourceType: ResourceType;
    resourceId: string;
    data: permissions.TUpdateResourcePermissionsRequest;
  }
> => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resourceType, resourceId, data }) =>
      dataService.updateResourcePermissions(resourceType, resourceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.accessRoles, variables.resourceType],
      });

      queryClient.invalidateQueries({
        queryKey: [QueryKeys.resourcePermissions, variables.resourceType, variables.resourceId],
      });

      queryClient.invalidateQueries({
        queryKey: [QueryKeys.effectivePermissions, variables.resourceType, variables.resourceId],
      });
    },
  });
};

export const useGetEffectivePermissionsQuery = (
  resourceType: ResourceType,
  resourceId: string,
  config?: UseQueryOptions<permissions.TEffectivePermissionsResponse>,
): QueryObserverResult<permissions.TEffectivePermissionsResponse> => {
  return useQuery<permissions.TEffectivePermissionsResponse>({
    queryKey: [QueryKeys.effectivePermissions, resourceType, resourceId],
    queryFn: () => dataService.getEffectivePermissions(resourceType, resourceId),
    enabled: !!resourceType && !!resourceId,
    refetchOnWindowFocus: false,
    staleTime: 30000,
    ...config,
  });
};

export const useMCPServerConnectionStatusQuery = (
  serverName: string,
  config?: UseQueryOptions<MCPServerConnectionStatusResponse>,
): QueryObserverResult<MCPServerConnectionStatusResponse> => {
  return useQuery({
    queryKey: [QueryKeys.mcpConnectionStatus, serverName],
    queryFn: () => dataService.getMCPServerConnectionStatus(serverName),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,

    // 10 seconds
    staleTime: 10000,

    enabled: !!serverName,
    ...config
  });
};
