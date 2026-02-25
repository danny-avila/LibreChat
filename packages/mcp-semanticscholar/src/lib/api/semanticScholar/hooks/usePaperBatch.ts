import { useQuery } from "@tanstack/react-query";
import { getPapersBatch, getPapersBatchChunked } from "../endpoints.js";
import { Paper, PaperBatchParams } from "../types.js";

/**
 * Hook to fetch details for multiple papers at once using the /paper/batch endpoint
 * Automatically handles chunking for large batches (>500 IDs)
 *
 * @param params Object containing paper IDs and optional fields
 * @param options Optional react-query options
 * @returns Query result with array of Paper objects
 */
export const usePaperBatch = (
  params: PaperBatchParams,
  options?: {
    enabled?: boolean;
    refetchOnWindowFocus?: boolean;
    refetchOnMount?: boolean;
    staleTime?: number;
    gcTime?: number; // Renamed from cacheTime in React Query v5
  }
) => {
  return useQuery<Paper[], Error>({
    queryKey: ["paperBatch", params],
    queryFn: () => {
      // Use chunked version if there are more than 500 IDs
      if (params.ids.length > 500) {
        return getPapersBatchChunked(params);
      }
      return getPapersBatch(params);
    },
    enabled: params.ids.length > 0 && options?.enabled !== false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    refetchOnMount: options?.refetchOnMount,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
    retry: 3, // Retry up to 3 times
  });
};
