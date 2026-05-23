import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import { logger } from '~/utils';

type StableMessagesParams = {
  pathname: string;
  result: t.TMessage[];
  currentMessages?: t.TMessage[];
};

function hasUnhydratedMessage(messages: t.TMessage[]) {
  return messages.some((message) => {
    const messageId = message.messageId ?? '';
    return message.createdAt == null || message.updatedAt == null || messageId.endsWith('_');
  });
}

export function getStableMessages({
  pathname,
  result,
  currentMessages,
}: StableMessagesParams): t.TMessage[] {
  if (pathname.includes('/c/new') || !currentMessages?.length) {
    return result;
  }

  if (result.length >= currentMessages.length) {
    return result;
  }

  if (result.length === 1 || hasUnhydratedMessage(currentMessages)) {
    return currentMessages;
  }

  return result;
}

export const useGetMessagesByConvoId = <TData = t.TMessage[]>(
  id: string,
  config?: UseQueryOptions<t.TMessage[], unknown, TData>,
): QueryObserverResult<TData> => {
  const location = useLocation();
  const queryClient = useQueryClient();
  return useQuery<t.TMessage[], unknown, TData>(
    [QueryKeys.messages, id],
    async () => {
      const result = await dataService.getMessagesByConvoId(id);
      const currentMessages = queryClient.getQueryData<t.TMessage[]>([QueryKeys.messages, id]);
      const stableMessages = getStableMessages({
        pathname: location.pathname,
        result,
        currentMessages,
      });

      if (stableMessages === currentMessages) {
        logger.warn(
          'messages',
          `Messages query for convo ${id} returned fewer than cache; path: "${location.pathname}"`,
          result,
          currentMessages,
        );
      }

      return stableMessages;
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
