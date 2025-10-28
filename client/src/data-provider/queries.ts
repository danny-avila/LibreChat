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
  UseQueryResult,
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
  config?: Omit<UseQueryOptions<TPreset[], unknown, TPreset[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TPreset[], unknown> => {
  return useQuery({
    queryKey: [QueryKeys.presets],
    queryFn: () => dataService.getPresets(),
    staleTime: 1000 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetConvoIdQuery = (
  id: string,
  config?: Omit<UseQueryOptions<t.TConversation, unknown, t.TConversation>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TConversation, unknown> => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [QueryKeys.conversation, id],
    queryFn: () => {
      // Try to find in all fetched infinite pages
      const convosQuery = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(
        [QueryKeys.allConversations],
      );
      const found = findConversationInInfinite(convosQuery, id);

      if (found && found.messages != null) {
        return found;
      }
      // Otherwise, fetch from API
      return dataService.getConversationById(id);
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
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
    gcTime: 30 * 60 * 1000, // 30 minutes
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
    gcTime: 30 * 60 * 1000, // 30 minutes
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
    gcTime: 30 * 60 * 1000, // 30 minutes
    ...config,
  });
};

export const useConversationTagsQuery = (
  config?: Omit<
    UseQueryOptions<t.TConversationTagsResponse, unknown, t.TConversationTagsResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.TConversationTagsResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.conversationTags],
    queryFn: () => dataService.getConversationTags(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

/**
 * ASSISTANTS
 */

/**
 * Hook for getting available LibreChat tools (excludes MCP tools)
 * For MCP tools, use `useMCPToolsQuery` from mcp-queries.ts
 */
export const useAvailableToolsQuery = <TData = t.TPlugin[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: Omit<UseQueryOptions<t.TPlugin[], unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = isAgentsEndpoint(endpoint) ? true : !!endpointsConfig?.[endpoint] && keyProvided;
  const version: string | number | undefined =
    endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery({
    queryKey: [QueryKeys.tools],
    queryFn: () => dataService.getAvailableTools(endpoint, version),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled,
    ...config,
  });
};

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = <TData = AssistantListResponse>(
  endpoint: t.AssistantsEndpoint,
  params: Omit<AssistantListParams, 'endpoint'> = defaultOrderQuery,
  config?: Omit<UseQueryOptions<AssistantListResponse, unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery({
    queryKey: [QueryKeys.assistants, endpoint, params],
    queryFn: () => dataService.listAssistants({ ...params, endpoint }, version),

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
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled
  });
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
  config?: Omit<UseQueryOptions<Assistant, unknown, Assistant>, 'queryKey' | 'queryFn'>,
): UseQueryResult<Assistant, unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = endpointsConfig?.[endpoint]?.userProvide ?? false;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];
  return useQuery({
    queryKey: [QueryKeys.assistant, assistant_id],
    queryFn: () =>
      dataService.getAssistantById({
        endpoint,
        assistant_id,
        version,
      }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    // Query will not execute until the assistant_id exists
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
  });
};

/**
 * Hook for retrieving user's saved Assistant Actions
 */
export const useGetActionsQuery = <TData = Action[]>(
  endpoint: t.AssistantsEndpoint | EModelEndpoint.agents,
  config?: Omit<UseQueryOptions<Action[], unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!endpointsConfig?.[endpoint]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled =
    (!!endpointsConfig?.[endpoint] && keyProvided) || endpoint === EModelEndpoint.agents;

  return useQuery({
    queryKey: [QueryKeys.actions],
    queryFn: () => dataService.getActions(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled
  });
};

/**
 * Hook for retrieving user's saved Assistant Documents (metadata saved to Database)
 */
export const useGetAssistantDocsQuery = <TData = AssistantDocument[]>(
  endpoint: t.AssistantsEndpoint | string,
  config?: Omit<UseQueryOptions<AssistantDocument[], unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([QueryKeys.name, endpoint]);
  const userProvidesKey = !!(endpointsConfig?.[endpoint]?.userProvide ?? false);
  const keyProvided = userProvidesKey ? !!(keyExpiry?.expiresAt ?? '') : true;
  const enabled = !!endpointsConfig?.[endpoint] && keyProvided;
  const version = endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint];

  return useQuery({
    queryKey: [QueryKeys.assistantDocs, endpoint],
    queryFn: () =>
      dataService.getAssistantDocs({
        endpoint,
        version,
      }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled
  });
};

/** STT/TTS */

/* Text to speech voices */
export const useVoicesQuery = (
  config?: Omit<UseQueryOptions<t.VoiceResponse, unknown, t.VoiceResponse>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.VoiceResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.voices],
    queryFn: () => dataService.getVoices(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

/* Custom config speech */
export const useCustomConfigSpeechQuery = (
  config?: Omit<
    UseQueryOptions<t.TCustomConfigSpeechResponse, unknown, t.TCustomConfigSpeechResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.TCustomConfigSpeechResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.customConfigSpeech],
    queryFn: () => dataService.getCustomConfigSpeech(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

/** Prompt */

export const usePromptGroupsInfiniteQuery = (
  params?: t.TPromptGroupsWithFilterRequest,
  config?: UseInfiniteQueryOptions<t.PromptGroupListResponse, unknown>,
) => {
  const { name, pageSize, category } = params || {};
  return useInfiniteQuery<t.PromptGroupListResponse, unknown>({
    queryKey: [QueryKeys.promptGroups, name, category, pageSize],
    queryFn: ({ pageParam }) => {
      const queryParams: t.TPromptGroupsWithFilterRequest = {
        name,
        category: category || '',
        limit: (pageSize || 10).toString(),
      };

      // Only add cursor if it's a valid string
      if (pageParam && typeof pageParam === 'string') {
        queryParams.cursor = pageParam;
      }

      return dataService.getPromptGroups(queryParams);
    },
    getNextPageParam: (lastPage) => {
      // Use cursor-based pagination - ensure we return a valid cursor or undefined
      return lastPage.has_more && lastPage.after ? lastPage.after : undefined;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetPromptGroup = (
  id: string,
  config?: Omit<UseQueryOptions<t.TPromptGroup, unknown, t.TPromptGroup>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TPromptGroup, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.promptGroup, id],
    queryFn: () => dataService.getPromptGroup(id),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled : true,
  });
};

export const useGetPrompts = (
  filter: t.TPromptsWithFilterRequest,
  config?: Omit<UseQueryOptions<t.TPrompt[], unknown, t.TPrompt[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TPrompt[], unknown> => {
  return useQuery({
    queryKey: [QueryKeys.prompts, filter.groupId ?? ''],
    queryFn: () => dataService.getPrompts(filter),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled : true,
  });
};

export const useGetAllPromptGroups = <TData = t.AllPromptGroupsResponse>(
  filter?: t.AllPromptGroupsFilterRequest,
  config?: Omit<UseQueryOptions<t.AllPromptGroupsResponse, unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.allPromptGroups],
    queryFn: () => dataService.getAllPromptGroups(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
  });
};

export const useGetCategories = <TData = t.TGetCategoriesResponse>(
  config?: Omit<UseQueryOptions<t.TGetCategoriesResponse, unknown, TData>, 'queryKey' | 'queryFn'>,
): UseQueryResult<TData, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.categories],
    queryFn: () => dataService.getCategories(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled : true,
  });
};

export const useGetRandomPrompts = (
  filter: t.TGetRandomPromptsRequest,
  config?: Omit<
    UseQueryOptions<t.TGetRandomPromptsResponse, unknown, t.TGetRandomPromptsResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<t.TGetRandomPromptsResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.randomPrompts],
    queryFn: () => dataService.getRandomPrompts(filter),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    ...config,
    enabled: config?.enabled !== undefined ? config.enabled : true,
  });
};

export const useUserTermsQuery = (
  config?: Omit<UseQueryOptions<t.TUserTermsResponse, unknown, t.TUserTermsResponse>, 'queryKey' | 'queryFn'>,
): UseQueryResult<t.TUserTermsResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.userTerms],
    queryFn: () => dataService.getUserTerms(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};
