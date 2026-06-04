import { useCallback } from 'react';
import { selectorFamily, useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { getMessageBranchSiblingParentIds, selectActiveBranchTail } from '~/utils';
import store from '~/store';

const NULL_PARENT_KEY = '__null_parent__';
const EMPTY_PARENT_IDS: (string | null)[] = [];

const getParentLookupKey = (parentMessageId: string | null | undefined) =>
  parentMessageId ?? NULL_PARENT_KEY;

const siblingIndexesByParentSelector = selectorFamily<
  Record<string, number>,
  readonly (string | null)[]
>({
  key: 'latestMessageSiblingIndexesByParent',
  get:
    (parentIds) =>
    ({ get }) => {
      const indexes: Record<string, number> = {};

      for (const parentId of parentIds) {
        indexes[getParentLookupKey(parentId)] = get(store.messagesSiblingIdxFamily(parentId));
      }

      return indexes;
    },
});

function useMessagesCacheSelect<TData>(
  messagesQueryId: string | null | undefined,
  select: (messages: TMessage[]) => TData,
): TData | null {
  const queryClient = useQueryClient();
  const queryKey = [QueryKeys.messages, messagesQueryId ?? ''];

  const { data } = useQuery<TMessage[], unknown, TData>(
    queryKey,
    async () => queryClient.getQueryData<TMessage[]>(queryKey) ?? [],
    {
      enabled: false,
      select,
    },
  );

  if (!messagesQueryId) {
    return null;
  }

  return data ?? null;
}

function useLatestMessagesQueryId(
  index: string | number,
  conversationId: string | null,
  messagesQueryId?: string | null,
) {
  const { conversationId: routeConversationId } = useParams();

  if (!conversationId) {
    return null;
  }

  if (messagesQueryId != null) {
    return messagesQueryId;
  }

  if (index === 0 && routeConversationId) {
    return routeConversationId === Constants.NEW_CONVO ? Constants.NEW_CONVO : routeConversationId;
  }

  return conversationId;
}

function useLatestMessageSiblingIndexes(
  messagesQueryId: string | null | undefined,
  rootSiblingKey: string | null,
) {
  const selectParentIds = useCallback(
    (messages: TMessage[]) => getMessageBranchSiblingParentIds(messages, rootSiblingKey),
    [rootSiblingKey],
  );
  const parentIds = useMessagesCacheSelect(messagesQueryId, selectParentIds) ?? EMPTY_PARENT_IDS;
  return useRecoilValue(siblingIndexesByParentSelector(parentIds));
}

export function useLatestMessage(
  index: string | number,
  messagesQueryIdOverride?: string | null,
): TMessage | null {
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const messagesQueryId = useLatestMessagesQueryId(index, conversationId, messagesQueryIdOverride);
  const siblingIndexes = useLatestMessageSiblingIndexes(messagesQueryId, conversationId);
  const select = useCallback(
    (messages: TMessage[]) =>
      selectActiveBranchTail(
        messages,
        conversationId,
        (parentId) => siblingIndexes[getParentLookupKey(parentId)] ?? 0,
      ),
    [conversationId, siblingIndexes],
  );

  return useMessagesCacheSelect(messagesQueryId, select);
}

export function useLatestMessageId(
  index: string | number,
  messagesQueryIdOverride?: string | null,
): string | null {
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const messagesQueryId = useLatestMessagesQueryId(index, conversationId, messagesQueryIdOverride);
  const siblingIndexes = useLatestMessageSiblingIndexes(messagesQueryId, conversationId);
  const select = useCallback(
    (messages: TMessage[]) =>
      selectActiveBranchTail(
        messages,
        conversationId,
        (parentId) => siblingIndexes[getParentLookupKey(parentId)] ?? 0,
      )?.messageId ?? null,
    [conversationId, siblingIndexes],
  );

  return useMessagesCacheSelect(messagesQueryId, select);
}
