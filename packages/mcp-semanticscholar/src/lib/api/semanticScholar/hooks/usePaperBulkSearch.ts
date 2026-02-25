import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { searchPapersBulk } from "../endpoints.js";
import { PaperBulkSearchParams, PaperBulkSearchResult } from "../types.js";

/**
 * Hook to search for papers in bulk using the Semantic Scholar API
 *
 * Features:
 * - Query is optional and supports boolean logic
 * - Up to 1,000 papers returned per call
 * - Pagination via token
 * - Rate limited to 10 requests per second
 *
 * @param params PaperBulkSearchParams object
 * @param options Optional react-query options
 * @returns Query result with PaperBulkSearchResult and helper methods
 */
export const usePaperBulkSearch = (
  params: PaperBulkSearchParams,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
  }
) => {
  const result = useQuery<PaperBulkSearchResult, Error>({
    queryKey: ["paperBulkSearch", params],
    queryFn: () => searchPapersBulk(params),
    // Enable even without query since it's optional in bulk search
    enabled: options?.enabled !== false,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
    retry: 3, // Retry up to 3 times
  });

  /**
   * Helper function to fetch the next page of results using the token
   * @returns Promise with the next page of results, or null if there are no more results
   */
  const fetchNextPage = useCallback(async () => {
    if (result.data?.token) {
      const nextParams = {
        ...params,
        token: result.data.token,
      };
      return searchPapersBulk(nextParams);
    }
    return null;
  }, [result.data, params]);

  return {
    ...result,
    fetchNextPage,
    hasNextPage: !!result.data?.token,
  };
};
