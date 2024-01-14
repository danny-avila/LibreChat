import {
  UseQueryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  UseMutationResult,
  QueryObserverResult,
} from '@tanstack/react-query';
import * as t from '../types';
import * as s from '../schemas';
import * as m from '../types/mutations';
import * as dataService from '../data-service';
import request from '../request';
import { QueryKeys } from '../keys';

export const useAbortRequestWithMessage = (): UseMutationResult<
  void,
  Error,
  { endpoint: string; abortKey: string; message: string }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ endpoint, abortKey, message }) =>
      dataService.abortRequestWithMessage(endpoint, abortKey, message),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.balance]);
      },
    },
  );
};

export const useGetUserQuery = (
  config?: UseQueryOptions<t.TUser>,
): QueryObserverResult<t.TUser> => {
  return useQuery<t.TUser>([QueryKeys.user], () => dataService.getUser(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useGetMessagesByConvoId = <TData = s.TMessage[]>(
  id: string,
  config?: UseQueryOptions<s.TMessage[], unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<s.TMessage[], unknown, TData>(
    [QueryKeys.messages, id],
    () => dataService.getMessagesByConvoId(id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetUserBalance = (
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> => {
  return useQuery<string>([QueryKeys.balance], () => dataService.getUserBalance(), {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    ...config,
  });
};

export const useGetConversationByIdQuery = (
  id: string,
  config?: UseQueryOptions<s.TConversation>,
): QueryObserverResult<s.TConversation> => {
  return useQuery<s.TConversation>(
    [QueryKeys.conversation, id],
    () => dataService.getConversationById(id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/* like above, but first try the convos query data */
export const useGetConvoIdQuery = (
  id: string,
  config?: UseQueryOptions<s.TConversation>,
): QueryObserverResult<s.TConversation> => {
  const queryClient = useQueryClient();
  return useQuery<s.TConversation>(
    [QueryKeys.conversation, id],
    () => {
      const defaultQuery = () => dataService.getConversationById(id);

      const convosQueryKey = [QueryKeys.allConversations, { pageNumber: '1', active: true }];
      const convosQuery = queryClient.getQueryData<t.TGetConversationsResponse>(convosQueryKey);

      if (!convosQuery) {
        return defaultQuery();
      }

      const convo = convosQuery.conversations?.find((c) => c.conversationId === id);
      if (convo) {
        return convo;
      }

      return defaultQuery();
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

//This isn't ideal because its just a query and we're using mutation, but it was the only way
//to make it work with how the Chat component is structured
export const useGetConversationByIdMutation = (id: string): UseMutationResult<s.TConversation> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.getConversationById(id), {
    // onSuccess: (res: s.TConversation) => {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.conversation, id]);
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
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.conversation, id]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    },
  );
};

export const useUpdateMessageMutation = (
  id: string,
): UseMutationResult<unknown, unknown, t.TUpdateMessageRequest, unknown> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TUpdateMessageRequest) => dataService.updateMessage(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.messages, id]);
    },
  });
};

export const useUpdateUserKeysMutation = (): UseMutationResult<
  t.TUser,
  unknown,
  t.TUpdateUserKeyRequest,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TUpdateUserKeyRequest) => dataService.updateUserKey(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.name]);
    },
  });
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
        queryClient.invalidateQueries([QueryKeys.conversation, id]);
        queryClient.invalidateQueries([QueryKeys.allConversations]);
      },
    },
  );
};

export const useClearConversationsMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.clearAllConversations(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    },
  });
};

export const useRevokeUserKeyMutation = (name: string): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.revokeUserKey(name), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.name]);
    },
  });
};

export const useRevokeAllUserKeysMutation = (): UseMutationResult<unknown> => {
  const queryClient = useQueryClient();
  return useMutation(() => dataService.revokeAllUserKeys(), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.name]);
    },
  });
};

export const useGetConversationsQuery = (
  pageNumber: string,
  config?: UseQueryOptions<t.TGetConversationsResponse>,
): QueryObserverResult<t.TGetConversationsResponse> => {
  return useQuery<t.TGetConversationsResponse>(
    [QueryKeys.allConversations, { pageNumber, active: true }],
    () => dataService.getConversations(pageNumber),
    {
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
      ...config,
    },
  );
};

export const useGetSearchEnabledQuery = (
  config?: UseQueryOptions<boolean>,
): QueryObserverResult<boolean> => {
  return useQuery<boolean>([QueryKeys.searchEnabled], () => dataService.getSearchEnabled(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: UseQueryOptions<t.TEndpointsConfig, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.TEndpointsConfig, unknown, TData>(
    [QueryKeys.endpoints],
    () => dataService.getAIEndpoints(),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetModelsQuery = (
  config?: UseQueryOptions<t.TModelsConfig>,
): QueryObserverResult<t.TModelsConfig> => {
  return useQuery<t.TModelsConfig>([QueryKeys.models], () => dataService.getModels(), {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useCreatePresetMutation = (): UseMutationResult<
  s.TPreset,
  unknown,
  s.TPreset,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: s.TPreset) => dataService.createPreset(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.presets]);
    },
  });
};

export const useDeletePresetMutation = (): UseMutationResult<
  m.PresetDeleteResponse,
  unknown,
  s.TPreset | undefined,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: s.TPreset | undefined) => dataService.deletePreset(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.presets]);
    },
  });
};

export const useSearchQuery = (
  searchQuery: string,
  pageNumber: string,
  config?: UseQueryOptions<t.TSearchResults>,
): QueryObserverResult<t.TSearchResults> => {
  return useQuery<t.TSearchResults>(
    [QueryKeys.searchResults, pageNumber, searchQuery],
    () => dataService.searchConversations(searchQuery, pageNumber),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUpdateTokenCountMutation = (): UseMutationResult<
  t.TUpdateTokenCountResponse,
  unknown,
  { text: string },
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(({ text }: { text: string }) => dataService.updateTokenCount(text), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.tokenCount]);
    },
  });
};

export const useLoginUserMutation = (): UseMutationResult<
  t.TLoginResponse,
  unknown,
  t.TLoginUser,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TLoginUser) => dataService.login(payload), {
    onMutate: () => {
      queryClient.removeQueries();
      localStorage.removeItem('lastConversationSetup');
      localStorage.removeItem('lastSelectedModel');
      localStorage.removeItem('lastSelectedTools');
      localStorage.removeItem('filesToDelete');
      localStorage.removeItem('lastAssistant');
    },
  });
};

export const useRegisterUserMutation = (): UseMutationResult<
  unknown,
  unknown,
  t.TRegisterUser,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TRegisterUser) => dataService.register(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.user]);
    },
  });
};

export const useRefreshTokenMutation = (): UseMutationResult<
  t.TRefreshTokenResponse,
  unknown,
  unknown,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation(() => request.refreshToken(), {
    onMutate: () => {
      queryClient.removeQueries();
    },
  });
};

export const useUserKeyQuery = (
  name: string,
  config?: UseQueryOptions<t.TCheckUserKeyResponse>,
): QueryObserverResult<t.TCheckUserKeyResponse> => {
  return useQuery<t.TCheckUserKeyResponse>(
    [QueryKeys.name, name],
    () => {
      if (!name) {
        return Promise.resolve({ expiresAt: '' });
      }
      return dataService.userKeyQuery(name);
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

export const useRequestPasswordResetMutation = (): UseMutationResult<
  t.TRequestPasswordResetResponse,
  unknown,
  t.TRequestPasswordReset,
  unknown
> => {
  return useMutation((payload: t.TRequestPasswordReset) =>
    dataService.requestPasswordReset(payload),
  );
};

export const useResetPasswordMutation = (): UseMutationResult<
  unknown,
  unknown,
  t.TResetPassword,
  unknown
> => {
  return useMutation((payload: t.TResetPassword) => dataService.resetPassword(payload));
};

export const useAvailablePluginsQuery = (): QueryObserverResult<s.TPlugin[]> => {
  return useQuery<s.TPlugin[]>(
    [QueryKeys.availablePlugins],
    () => dataService.getAvailablePlugins(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  );
};

export const useUpdateUserPluginsMutation = (): UseMutationResult<
  t.TUser,
  unknown,
  t.TUpdateUserPlugins,
  unknown
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: t.TUpdateUserPlugins) => dataService.updateUserPlugins(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.user]);
    },
  });
};

export const useGetStartupConfig = (): QueryObserverResult<t.TStartupConfig> => {
  return useQuery<t.TStartupConfig>(
    [QueryKeys.startupConfig],
    () => dataService.getStartupConfig(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  );
};
