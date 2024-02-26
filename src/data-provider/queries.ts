import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UseInfiniteQueryOptions,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import type {
  TPreset,
  TFile,
  ConversationListResponse,
  ConversationListParams,
} from 'librechat-data-provider';
import { findPageForConversation } from '~/utils';

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
    [QueryKeys.allConversations],
    ({ pageParam = '' }) =>
      dataService.listConversations({ ...params, pageNumber: pageParam?.toString() }),
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
