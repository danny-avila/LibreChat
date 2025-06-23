import { useMemo } from 'react';

import type { UseQueryOptions } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

import {
  useGetPromotedAgentsQuery,
  useGetAgentsByCategoryQuery,
  useSearchAgentsQuery,
} from '~/data-provider';

interface UseDynamicAgentQueryParams {
  category: string;
  searchQuery: string;
  page?: number;
  limit?: number;
}

/**
 * Single dynamic query hook that replaces 4 separate conditional queries
 * Determines the appropriate query based on category and search state
 */
export const useDynamicAgentQuery = ({
  category,
  searchQuery,
  page = 1,
  limit = 6,
}: UseDynamicAgentQueryParams) => {
  // Shared query configuration optimized to prevent unnecessary loading states
  const queryConfig: UseQueryOptions<t.AgentListResponse> = useMemo(
    () => ({
      staleTime: 1000 * 60 * 2, // 2 minutes - agents don't change frequently
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
      keepPreviousData: true,
      // Removed placeholderData due to TypeScript compatibility - keepPreviousData is sufficient
    }),
    [],
  );

  // Determine query type and parameters based on current state
  const queryType = useMemo(() => {
    if (searchQuery) return 'search';
    if (category === 'promoted') return 'promoted';
    if (category === 'all') return 'all';
    return 'category';
  }, [category, searchQuery]);

  // Search query - when user is searching
  const searchQuery_result = useSearchAgentsQuery(
    {
      q: searchQuery,
      ...(category !== 'all' && category !== 'promoted' && { category }),
      page,
      limit,
    },
    {
      ...queryConfig,
      enabled: queryType === 'search',
    },
  );

  // Promoted agents query - for "Top Picks" tab
  const promotedQuery = useGetPromotedAgentsQuery(
    { page, limit },
    {
      ...queryConfig,
      enabled: queryType === 'promoted',
    },
  );

  // All agents query - for "All" tab (promoted endpoint with showAll parameter)
  const allAgentsQuery = useGetPromotedAgentsQuery(
    { page, limit, showAll: 'true' },
    {
      ...queryConfig,
      enabled: queryType === 'all',
    },
  );

  // Category-specific query - for individual categories
  const categoryQuery = useGetAgentsByCategoryQuery(
    { category, page, limit },
    {
      ...queryConfig,
      enabled: queryType === 'category',
    },
  );

  // Return the active query based on current state
  const activeQuery = useMemo(() => {
    switch (queryType) {
      case 'search':
        return searchQuery_result;
      case 'promoted':
        return promotedQuery;
      case 'all':
        return allAgentsQuery;
      case 'category':
        return categoryQuery;
      default:
        return promotedQuery; // fallback
    }
  }, [queryType, searchQuery_result, promotedQuery, allAgentsQuery, categoryQuery]);

  return {
    ...activeQuery,
    queryType, // Expose query type for debugging/logging
  };
};
