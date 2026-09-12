import { QueryKeys, dataService } from 'librechat-data-provider';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  UseInfiniteQueryResult,
  QueryObserverResult,
  UseQueryOptions,
} from '@tanstack/react-query';
import type { TTracePage, TTraceAvailability, TTraceRecordDetail } from 'librechat-data-provider';

/** Availability flips only when a response is sampled, so callers re-enable it after a turn. */
export const useConversationTraceAvailabilityQuery = (
  conversationId: string,
  config?: UseQueryOptions<TTraceAvailability>,
): QueryObserverResult<TTraceAvailability> =>
  useQuery<TTraceAvailability>(
    [QueryKeys.conversationTraceAvailability, conversationId],
    () => dataService.getConversationTraceAvailability(conversationId),
    {
      retry: false,
      refetchOnWindowFocus: false,
      ...config,
    },
  );

export const useConversationTraceRecordsQuery = (
  conversationId: string,
  enabled: boolean,
): UseInfiniteQueryResult<TTracePage> =>
  useInfiniteQuery<TTracePage>({
    queryKey: [QueryKeys.conversationTraceRecords, conversationId],
    queryFn: ({ pageParam }) =>
      dataService.getConversationTraceRecords({
        conversationId,
        cursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useConversationTraceRecordQuery = (
  conversationId: string,
  recordId: string | null,
  enabled: boolean,
): QueryObserverResult<TTraceRecordDetail> =>
  useQuery<TTraceRecordDetail>(
    [QueryKeys.conversationTraceRecord, conversationId, recordId],
    () => dataService.getConversationTraceRecord(conversationId, recordId ?? ''),
    {
      enabled: enabled && recordId != null,
      retry: false,
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  );
