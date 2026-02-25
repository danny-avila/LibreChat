import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { searchPapers } from "../endpoints.js";
import { SearchParams, PaperSearchResult } from "../types.js";
import { FilterBuilder } from "../filters.js";

/**
 * React Query hook for searching papers
 * @param params SearchParams object, FilterBuilder instance, or null
 * @returns Query result with PaperSearchResult data and helper methods
 */
export const usePaperSearch = (
  params: SearchParams | FilterBuilder | null,
  options?: {
    enabled?: boolean;
  }
): UseQueryResult<PaperSearchResult, Error> & {
  fetchNextPage: () => Promise<PaperSearchResult | null>;
  hasNextPage: boolean;
} => {
  // Handle different parameter types
  const finalParams =
    params instanceof FilterBuilder ? params.build() : params || { query: "" };

  const result = useQuery<PaperSearchResult, Error>({
    queryKey: ["paperSearch", finalParams],
    queryFn: () => searchPapers(finalParams),
    enabled: !!finalParams.query && options?.enabled !== false, // Only run if there's a query and not explicitly disabled
  });

  /**
   * Helper function to fetch the next page of results
   * @returns Promise with the next page of results, or null if there are no more results
   */
  const fetchNextPage = useCallback(async () => {
    if (result.data && typeof result.data === "object" && result.data.next) {
      const nextParams = {
        ...finalParams,
        offset: result.data.next,
      };
      return searchPapers(nextParams);
    }
    return null;
  }, [result.data, finalParams]);

  // Check if there's a next page
  const hasNextPage = !!(
    result.data &&
    typeof result.data === "object" &&
    result.data.next
  );

  return {
    ...result,
    fetchNextPage,
    hasNextPage,
  };
};
