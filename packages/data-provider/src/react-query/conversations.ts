import { useInfiniteQuery } from '@tanstack/react-query';

import type { UseInfiniteQueryOptions } from '@tanstack/react-query';
import { QueryKeys } from '../keys';
import * as c from '../types/conversations';
import * as dataService from '../data-service';

export const useSearchInfiniteQuery = (
  params?: c.ConversationListParams & { searchQuery?: string },
  config?: UseInfiniteQueryOptions<c.ConversationListResponse, unknown>,
) => {
  return useInfiniteQuery<c.ConversationListResponse, unknown>(
    [QueryKeys.allConversations, params], // Include the searchQuery in the query key
    ({ pageParam = '1' }) =>
      dataService.listConversationsByQuery({ ...params, pageNumber: pageParam }),
    {
      getNextPageParam: (lastPage) => {
        const currentPageNumber = Number(lastPage.pageNumber);
        const totalPages = Number(lastPage.pages);
        return currentPageNumber < totalPages ? currentPageNumber + 1 : undefined;
      },
      ...config,
    },
  );
};

export const useConversationsInfiniteQuery = (
  params?: c.ConversationListParams,
  config?: UseInfiniteQueryOptions<c.ConversationListResponse, unknown>,
) => {
  return useInfiniteQuery<c.ConversationListResponse, unknown>(
    [QueryKeys.allConversations, params],
    ({ pageParam = '' }) =>
      dataService.listConversations({ ...params, pageNumber: pageParam.toString() }),
    {
      getNextPageParam: (lastPage) => {
        const currentPageNumber = Number(lastPage.pageNumber);
        const totalPages = Number(lastPage.pages); // Convert totalPages to a number
        // If the current page number is less than total pages, return the next page number
        return currentPageNumber < totalPages ? currentPageNumber + 1 : undefined;
      },
      ...config,
    },
  );
};
