import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { TConversationTagsResponse } from 'librechat-data-provider';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetConversationTags = (
  config?: Omit<
    UseQueryOptions<TConversationTagsResponse, unknown, TConversationTagsResponse>,
    'queryKey' | 'queryFn'
  >,
): UseQueryResult<TConversationTagsResponse, unknown> => {
  return useQuery({
    queryKey: [QueryKeys.conversationTags],
    queryFn: () => dataService.getConversationTags(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};
