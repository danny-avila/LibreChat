import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { searchAuthors } from "../endpoints.js";
import { SearchParams, AuthorSearchResult } from "../types.js";
import { FilterBuilder } from "../filters.js";

/**
 * React Query hook for searching authors
 *
 * @param params SearchParams object, FilterBuilder instance, or null
 * @param options Optional React Query configuration options
 * @returns Query result with AuthorSearchResult data
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useAuthorSearch({
 *   query: 'Oren Etzioni'
 * });
 *
 * @example
 * // With additional parameters
 * const { data, isLoading, error } = useAuthorSearch({
 *   query: 'Oren Etzioni',
 *   limit: 10,
 *   fields: 'name,affiliations,paperCount'
 * });
 *
 * @example
 * // Using FilterBuilder
 * const filter = createFilter('Oren Etzioni')
 *   .withFields(['name', 'affiliations'])
 *   .withPagination(0, 10);
 * const { data, isLoading, error } = useAuthorSearch(filter);
 */
export const useAuthorSearch = (
  params: SearchParams | FilterBuilder | null,
  options?: Omit<
    UseQueryOptions<AuthorSearchResult, Error>,
    "queryKey" | "queryFn"
  >
): UseQueryResult<AuthorSearchResult, Error> => {
  // Handle different parameter types
  const finalParams =
    params instanceof FilterBuilder ? params.build() : params || { query: "" };

  return useQuery<AuthorSearchResult, Error>({
    queryKey: ["authorSearch", finalParams],
    queryFn: () => searchAuthors(finalParams),
    enabled: !!finalParams.query && options?.enabled !== false, // Only run if there's a query and not explicitly disabled
    retry: (failureCount, error) => {
      // Don't retry for invalid parameters
      if (error.message?.includes("Invalid search parameters")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    ...options,
  });
};
