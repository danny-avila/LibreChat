import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { matchPaper } from "../endpoints.js";
import { MatchParams, PaperMatchResult } from "../types.js";
import { FilterBuilder } from "../filters.js";

/**
 * React Query hook for matching a paper by title
 * This hook uses the /paper/search/match endpoint to find a single paper
 * that is the closest title match to the given query.
 *
 * @param params MatchParams object, FilterBuilder instance, or null
 * @param options Optional configuration options
 * @returns Query result with PaperMatchResult data
 *
 * @example
 * // Basic usage with MatchParams
 * const { data, isLoading, error } = usePaperMatch({
 *   query: 'Construction of the Literature Graph in Semantic Scholar'
 * });
 *
 * @example
 * // Using with FilterBuilder
 * const filter = createFilter('Construction of the Literature Graph')
 *   .withFields(['title', 'abstract', 'authors']);
 * const { data, isLoading, error } = usePaperMatch(filter);
 */
export const usePaperMatch = (
  params: MatchParams | FilterBuilder | null,
  options?: {
    enabled?: boolean;
  }
): UseQueryResult<PaperMatchResult, Error> => {
  // Handle different parameter types
  const finalParams =
    params instanceof FilterBuilder
      ? params.buildMatchParams()
      : params || { query: "" };

  // Set up error logging
  const errorLogger = (error: Error): void => {
    console.error("Paper match query error:", error.message);
  };

  const queryOptions: UseQueryOptions<PaperMatchResult, Error> = {
    queryKey: ["paperMatch", finalParams],
    queryFn: () => matchPaper(finalParams),
    enabled: !!finalParams.query && options?.enabled !== false, // Only run if there's a query and not explicitly disabled
    retry: (failureCount, error) => {
      // Don't retry if the error is "Title match not found"
      if (error.message === "Title match not found") {
        return false;
      }
      // Don't retry for invalid parameters
      if (error.message.includes("Invalid match parameters")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
  };

  const result = useQuery<PaperMatchResult, Error>(queryOptions);

  // Handle errors outside of the query options
  if (result.error) {
    errorLogger(result.error);
  }

  return result;
};
