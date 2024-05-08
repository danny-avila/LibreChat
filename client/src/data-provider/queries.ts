import { EModelEndpoint, QueryKeys, dataService, defaultOrderQuery } from 'librechat-data-provider';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import type {
  Action,
  TPreset,
  TFile,
  TPlugin,
  FileConfig,
  ConversationListResponse,
  ConversationListParams,
  Assistant,
  AssistantListParams,
  AssistantListResponse,
  AssistantDocument,
  TEndpointsConfig,
  TCheckUserKeyResponse,
} from 'librechat-data-provider';
import { findPageForConversation, addFileToCache } from '~/utils';

export const useGetFiles = <TData = TFile[] | boolean>(
  config?: UseQueryOptions<TFile[], unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  return useQuery<TFile[], unknown, TData>([QueryKeys.files], () => dataService.getFiles(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

export const useGetFileConfig = <TData = FileConfig>(
  config?: UseQueryOptions<FileConfig, unknown, TData>,
): QueryObserverResult<TData, unknown> => {
  return useQuery<FileConfig, unknown, TData>(
    [QueryKeys.fileConfig],
    () => dataService.getFileConfig(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useGetPresetsQuery = (
  config?: UseQueryOptions<TPreset[]>,
): QueryObserverResult<TPreset[], unknown> => {
  return useQuery<TPreset[]>([QueryKeys.presets], () => dataService.getPresets(), {
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
      const defaultQuery = () => dataService.getConversationById(id);
      const convosQuery = queryClient.getQueryData<t.ConversationData>([
        QueryKeys.allConversations,
      ]);

      if (!convosQuery) {
        return defaultQuery();
      }

      const { pageIndex, convIndex } = findPageForConversation(convosQuery, { conversationId: id });

      if (pageIndex > -1 && convIndex > -1) {
        return convosQuery.pages[pageIndex].conversations[convIndex];
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

export const useSearchInfiniteQuery = (
  params?: ConversationListParams & { searchQuery?: string },
  config?: UseInfiniteQueryOptions<ConversationListResponse, unknown>,
) => {
  return useInfiniteQuery<ConversationListResponse, unknown>(
    [QueryKeys.searchConversations, params], // Include the searchQuery in the query key
    ({ pageParam = '1' }) =>
      dataService.listConversationsByQuery({ ...params, pageNumber: pageParam }),
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

export const useConversationsInfiniteQuery = (
  params?: ConversationListParams,
  config?: UseInfiniteQueryOptions<ConversationListResponse, unknown>,
) => {
  return useInfiniteQuery<ConversationListResponse, unknown>(
    params?.isArchived ? [QueryKeys.archivedConversations] : [QueryKeys.allConversations],
    ({ pageParam = '' }) =>
      dataService.listConversations({
        ...params,
        pageNumber: pageParam?.toString(),
        isArchived: params?.isArchived || false,
      }),
    {
      getNextPageParam: (lastPage) => {
        const currentPageNumber = Number(lastPage.pageNumber);
        const totalPages = Number(lastPage.pages); // Convert totalPages to a number
        // If the current page number is less than total pages, return the next page number
        return currentPageNumber < totalPages ? currentPageNumber + 1 : undefined;
      },
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
export const useAvailableToolsQuery = (): QueryObserverResult<TPlugin[]> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useQuery<TPlugin[]>([QueryKeys.tools], () => dataService.getAvailableTools(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled,
  });
};

/**
 * Hook for listing all assistants, with optional parameters provided for pagination and sorting
 */
export const useListAssistantsQuery = <TData = AssistantListResponse>(
  params: AssistantListParams = defaultOrderQuery,
  config?: UseQueryOptions<AssistantListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useQuery<AssistantListResponse, unknown, TData>(
    [QueryKeys.assistants, params],
    () => dataService.listAssistants(params),
    {
      // Example selector to sort them by created_at
      // select: (res) => {
      //   return res.data.sort((a, b) => a.created_at - b.created_at);
      // },
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
    },
  );
};

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

/**
 * Hook for retrieving details about a single assistant
 */
export const useGetAssistantByIdQuery = (
  assistant_id: string,
  config?: UseQueryOptions<Assistant>,
): QueryObserverResult<Assistant> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useQuery<Assistant>(
    [QueryKeys.assistant, assistant_id],
    () => dataService.getAssistantById(assistant_id),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      // Query will not execute until the assistant_id exists
      enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
    },
  );
};

/**
 * Hook for retrieving user's saved Assistant Actions
 */
export const useGetActionsQuery = <TData = Action[]>(
  config?: UseQueryOptions<Action[], unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useQuery<Action[], unknown, TData>([QueryKeys.actions], () => dataService.getActions(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
    enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
  });
};
/**
 * Hook for retrieving user's saved Assistant Documents (metadata saved to Database)
 */
export const useGetAssistantDocsQuery = (
  config?: UseQueryOptions<AssistantDocument[]>,
): QueryObserverResult<AssistantDocument[], unknown> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);
  const keyExpiry = queryClient.getQueryData<TCheckUserKeyResponse>([
    QueryKeys.name,
    EModelEndpoint.assistants,
  ]);
  const userProvidesKey = !!endpointsConfig?.[EModelEndpoint.assistants]?.userProvide;
  const keyProvided = userProvidesKey ? !!keyExpiry?.expiresAt : true;
  const enabled = !!endpointsConfig?.[EModelEndpoint.assistants] && keyProvided;
  return useQuery<AssistantDocument[]>(
    [QueryKeys.assistantDocs],
    () => dataService.getAssistantDocs(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: config?.enabled !== undefined ? config?.enabled && enabled : enabled,
    },
  );
};

export const useFileDownload = (userId?: string, file_id?: string): QueryObserverResult<string> => {
  const queryClient = useQueryClient();
  return useQuery(
    [QueryKeys.fileDownload, file_id],
    async () => {
      if (!userId || !file_id) {
        console.warn('No user ID provided for file download');
        return;
      }
      const response = await dataService.getFileDownload(userId, file_id);
      const blob = response.data;
      const downloadURL = window.URL.createObjectURL(blob);
      try {
        const metadata: TFile | undefined = JSON.parse(response.headers['x-file-metadata']);
        if (!metadata) {
          console.warn('No metadata found for file download', response.headers);
          return downloadURL;
        }

        addFileToCache(queryClient, metadata);
      } catch (e) {
        console.error('Error parsing file metadata, skipped updating file query cache', e);
      }

      return downloadURL;
    },
    {
      enabled: false,
      retry: false,
    },
  );
};
