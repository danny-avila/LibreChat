import { useQuery } from "@tanstack/react-query";
import { getAuthorsBatch, getAuthorsBatchChunked } from "../endpoints.js";
import { Author, AuthorBatchParams } from "../types.js";

/**
 * Hook to fetch details for multiple authors at once using the /author/batch endpoint
 * Automatically handles chunking for large batches (>1,000 IDs)
 *
 * @param params Object containing author IDs and optional fields
 * @param options Optional react-query options
 * @returns Query result with array of Author objects
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useAuthorBatch({
 *   ids: ["1741101", "1780531"]
 * });
 *
 * @example
 * // With specific fields
 * const { data, isLoading, error } = useAuthorBatch({
 *   ids: ["1741101", "1780531"],
 *   fields: "name,hIndex,citationCount"
 * });
 *
 * @example
 * // With custom options
 * const { data, isLoading, error } = useAuthorBatch(
 *   { ids: ["1741101", "1780531"] },
 *   { enabled: someCondition, staleTime: 300000 }
 * );
 */
export const useAuthorBatch = (
  params: AuthorBatchParams,
  options?: {
    enabled?: boolean;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
    staleTime?: number;
    gcTime?: number; // Renamed from cacheTime in React Query v5
  }
) => {
  return useQuery<Author[], Error>({
    queryKey: ["authorBatch", params],
    queryFn: () => {
      // Use chunked version if there are more than 1,000 IDs
      if (params.ids.length > 1000) {
        return getAuthorsBatchChunked(params);
      }
      return getAuthorsBatch(params);
    },
    enabled: params.ids.length > 0 && options?.enabled !== false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    refetchOnMount: options?.refetchOnMount,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
    retry: 3, // Retry up to 3 times
  });
};
