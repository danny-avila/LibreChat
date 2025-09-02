import {
  QueryKeys,
  dataService,
  EModelEndpoint,
  isAgentsEndpoint,
  defaultOrderQuery,
  defaultAssistantsVersion,
} from 'librechat-data-provider';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
  InfiniteData,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import type {
  Action,
  TPreset,
  ConversationListResponse,
  ConversationListParams,
  MessagesListParams,
  MessagesListResponse,
  Assistant,
  AssistantListParams,
  AssistantListResponse,
  AssistantDocument,
  TEndpointsConfig,
  TCheckUserKeyResponse,
  SharedLinksListParams,
  SharedLinksResponse,
} from 'librechat-data-provider';
import type { ConversationCursorData } from '~/utils/convos';
import { findConversationInInfinite } from '~/utils';

export const useGetPresetsQuery = (
  config?: UseQueryOptions<TPreset[]>,
): QueryObserverResult<TPreset[], unknown> => {
  return useQuery<TPreset[]>([QueryKeys.presets], () => dataService.getPresets(), {
    staleTime: 1000 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetEndpointsConfigOverride = <TData = unknown | boolean>(
  config?: UseQueryOptions<unknown | boolean, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<unknown | boolean, unknown, TData>(
    [QueryKeys.endpointsConfigOverride],
    () => dataService.getEndpointsConfigOverride(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetConvoIdQuery = (
  id: string,
  config?: UseQueryOptions<t.TConversation>,
): QueryObserverResult<t.TConversation> => {
  const queryClient = useQueryClient();

  return useQuery<t.TConversation>(
    [QueryKeys.conversation, id],
    () => {
      // Try to find in all fetched infinite pages
      const convosQuery = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(
        [QueryKeys.allConversations],
        { exact: false },
      );
      const found = findConversationInInfinite(convosQuery, id);

      if (found && found.messages != null) {
        return found;
      }
      // Otherwise, fetch from API
      return dataService.getConversationById(id);
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useConversationsInfiniteQuery = (
  params: ConversationListParams,
  config?: UseInfiniteQueryOptions<ConversationListResponse, unknown>,
) => {
  const { isArchived, sortBy, sortDirection, tags, search } = params;

  return useInfiniteQuery<ConversationListResponse>({
    queryKey: [
      isArchived ? QueryKeys.archivedConversations : QueryKeys.allConversations,
      { isArchived, sortBy, sortDirection, tags, search },
    ],
    queryFn: ({ pageParam }) =>
      dataService.listConversations({
        isArchived,
        sortBy,
        sortDirection,
        tags,
        search,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useMessagesInfiniteQuery = (
  params: MessagesListParams,
  config?: UseInfiniteQueryOptions<MessagesListResponse, unknown>,
) => {
  const { sortBy, sortDirection, pageSize, conversationId, messageId, search } = params;

  return useInfiniteQuery<MessagesListResponse>({
    queryKey: [
      QueryKeys.messages,
      { sortBy, sortDirection, pageSize, conversationId, messageId, search },
    ],
    queryFn: ({ pageParam }) =>
      dataService.listMessages({
        sortBy,
        sortDirection,
        pageSize,
        conversationId,
        messageId,
        search,
        cursor: pageParam?.toString(),
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useSharedLinksQuery = (
  params: SharedLinksListParams,
  config?: UseInfiniteQueryOptions<SharedLinksResponse, unknown>,
) => {
  const { pageSize, isPublic, search, sortBy, sortDirection } = params;

  return useInfiniteQuery<SharedLinksResponse>({
    queryKey: [QueryKeys.sharedLinks, { pageSize, isPublic, search, sortBy, sortDirection }],
    queryFn: ({ pageParam }) =>
      dataService.listSharedLinks({
        cursor: pageParam?.toString(),
        pageSize,
        isPublic,
        search,
        sortBy,
        sortDirection,
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    keepPreviousData: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useConversationTagsQuery = (
  config?: UseQueryOptions<t.TConversationTagsResponse>,
): QueryObserverResult<t.TConversationTagsResponse> => {
  return useQuery<t.TConversationTag[]>(
    [QueryKeys.conversationTags],
    () => dataService.getConversationTags(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

/**
 * ASSISTANTS
 */

/**
 * Hook for getting all available tools for Assistants
 */
export const useAvailableToolsQuery = <TData = t.TPlugin[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: UseQueryOptions<t.TPlugin[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = isAgentsEndpoint(endpoint) ? true : !!endpointsConfig?.[endpoint] && keyProvided;
  const version: string | number | undefined =
    endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<t.TPlugin[], unknown, TData>(
    [QueryKeys.tools],
    () => dataService.getAvailableTools(endpoint, version),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      enabled,
      ...config,
    },
  );
};

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = <TData = AssistantListResponse>(
  endpoint: t.AssistantsEndpoint,
  params: Omit<AssistantListParams, 'endpoint'> = defaultOrderQuery,
  config?: UseQueryOptions<AssistantListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<AssistantListResponse, unknown, TData>(
    [QueryKeys.assistants, endpoint, params],
    () => dataService.listAssistants({ ...params, endpoint }, version),
    {
      // Example selector to sort them by created_at
      // select: (res) => {
      //   return res.data.sort((a, b) => a.created_at - b.created_at);
      // },
      staleTime: 1000 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/*
export const useListAssistantsInfiniteQuery = (
  params?: AssistantListParams,
  config?: UseInfiniteQueryOptions<AssistantListResponse, Error>,
) => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useInfiniteQuery<AssistantListResponse, Error>(
    ['assistantsList', params],
    ({ pageParam = '' }) => dataService.listAssistants({ ...params, after: pageParam }),
    {
      getNextPageParam: (lastPage) => {
        // lastPage is of type AssistantListResponse, you can use the has_more and last_id from it directly
        if (lastPage.has_more) {
          return lastPage.last_id;
        }
        return undefined;
      },
      ...config,
      enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
    },
  );
};
*/

/**
 * Hook for retrieving details about a single assistant
 */
export const useGetAssistantByIdQuery = (
  endpoint: t.AssistantsEndpoint,
  assistant_id: string,
  config?: UseQueryOptions<Assistant>,
): QueryObserverResult<Assistant> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = endpointsConfig?.[endpoint]?.userProvide ?? false;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery<Assistant>(
    [QueryKeys.assistant, assistant_id],
    () =>
      dataService.getAssistantById({
        endpoint,
        assistant_id,
        version,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      // Query will not execute until the assistant_id exists
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/**
 * Hook for retrieving user's saved Assistant Actions
 */
export const useGetActionsQuery = <TData = Action[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: UseQueryOptions<Action[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled =
    (!!endpointsConfig?.[endpoint] && keyProvided) || endpoint === EModelEndpoint.agents;

  return useQuery<Action[], unknown, TData>([QueryKeys.actions], () => dataService.getActions(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
  });
};

/**
 * Hook for retrieving user's saved Assistant Documents (metadata saved to Database)
 */
export const useGetAssistantDocsQuery = <TData = AssistantDocument[]>(
  endpoint: t.AssistantsEndpoint | string,
  config?: UseQueryOptions<AssistantDocument[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];

  return useQuery<AssistantDocument[], unknown, TData>(
    [QueryKeys.assistantDocs, endpoint],
    () =>
      dataService.getAssistantDocs({
        endpoint,
        version,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/** STT/TTS */

/* Text to speech voices */
export const useVoicesQuery = (
  config?: UseQueryOptions<t.VoiceResponse>,
): QueryObserverResult<t.VoiceResponse> => {
  return useQuery<t.VoiceResponse>([QueryKeys.voices], () => dataService.getVoices(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

/* Custom config speech */
export const useCustomConfigSpeechQuery = (
  config?: UseQueryOptions<t.TCustomConfigSpeechResponse>,
): QueryObserverResult<t.TCustomConfigSpeechResponse> => {
  return useQuery<t.TCustomConfigSpeechResponse>(
    [QueryKeys.customConfigSpeech],
    () => dataService.getCustomConfigSpeech(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/** Prompt */

export const usePromptGroupsInfiniteQuery = (
  params?: t.TPromptGroupsWithFilterRequest,
  config?: UseInfiniteQueryOptions<t.PromptGroupListResponse, unknown>,
) => {
  const { name, pageSize, category, ...rest } = params || {};
  return useInfiniteQuery<t.PromptGroupListResponse, unknown>(
    [QueryKeys.promptGroups, name, category, pageSize],
    ({ pageParam = '1' }) =>
      dataService.getPromptGroups({
        ...rest,
        name,
        category: category || '',
        pageNumber: pageParam?.toString(),
        pageSize: (pageSize || 10).toString(),
      }),
    {
      getNextPageParam: (lastPage) => {
        const currentPageNumber = Number(lastPage.pageNumber);
        const totalPages = Number(lastPage.pages);
        return currentPageNumber < totalPages ? currentPageNumber + 1 : undefined;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetPromptGroup = (
  id: string,
  config?: UseQueryOptions<t.TPromptGroup>,
): QueryObserverResult<t.TPromptGroup> => {
  return useQuery<t.TPromptGroup>(
    [QueryKeys.promptGroup, id],
    () => dataService.getPromptGroup(id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetPrompts = (
  filter: t.TPromptsWithFilterRequest,
  config?: UseQueryOptions<t.TPrompt[]>,
): QueryObserverResult<t.TPrompt[]> => {
  return useQuery<t.TPrompt[]>(
    [QueryKeys.prompts, filter.groupId ?? ''],
    () => dataService.getPrompts(filter),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetAllPromptGroups = <TData = t.AllPromptGroupsResponse>(
  filter?: t.AllPromptGroupsFilterRequest,
  config?: UseQueryOptions<t.AllPromptGroupsResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.AllPromptGroupsResponse, unknown, TData>(
    [QueryKeys.allPromptGroups],
    () => dataService.getAllPromptGroups(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

export const useGetCategories = <TData = t.TGetCategoriesResponse>(
  config?: UseQueryOptions<t.TGetCategoriesResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  return useQuery<t.TGetCategoriesResponse, unknown, TData>(
    [QueryKeys.categories],
    () => dataService.getCategories(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useGetRandomPrompts = (
  filter: t.TGetRandomPromptsRequest,
  config?: UseQueryOptions<t.TGetRandomPromptsResponse>,
): QueryObserverResult<t.TGetRandomPromptsResponse> => {
  return useQuery<t.TGetRandomPromptsResponse>(
    [QueryKeys.randomPrompts],
    () => dataService.getRandomPrompts(filter),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled : true,
    },
  );
};

export const useUserTermsQuery = (
  config?: UseQueryOptions<t.TUserTermsResponse>,
): QueryObserverResult<t.TUserTermsResponse> => {
  return useQuery<t.TUserTermsResponse>([QueryKeys.userTerms], () => dataService.getUserTerms(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};
