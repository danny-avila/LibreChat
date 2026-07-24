import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { selectorFamily, useRecoilValue, useRecoilCallback } from 'recoil';
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

export type TLatestMessageMeta = Pick<TMessage, 'messageId' | 'error' | 'isCreatedByUser'>;

/**
 * Metadata-only projection of the branch tail. Streaming deltas leave these
 * fields untouched, so React Query's structural sharing keeps the selected
 * object referentially stable and consumers skip the per-delta re-renders a
 * full `useLatestMessage` subscription would cause.
 */
export function useLatestMessageMeta(
  index: string | number,
  messagesQueryIdOverride?: string | null,
): TLatestMessageMeta | null {
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const messagesQueryId = useLatestMessagesQueryId(index, conversationId, messagesQueryIdOverride);
  const siblingIndexes = useLatestMessageSiblingIndexes(messagesQueryId, conversationId);
  const select = useCallback(
    (messages: TMessage[]): TLatestMessageMeta | null => {
      const tail = selectActiveBranchTail(
        messages,
        conversationId,
        (parentId) => siblingIndexes[getParentLookupKey(parentId)] ?? 0,
      );
      if (!tail) {
        return null;
      }
      return {
        messageId: tail.messageId,
        error: tail.error,
        isCreatedByUser: tail.isCreatedByUser,
      };
    },
    [conversationId, siblingIndexes],
  );

  return useMessagesCacheSelect(messagesQueryId, select);
}

/**
 * Call-time reader for the branch tail: no cache subscription at all, so
 * callbacks that only need the latest message when invoked keep a stable
 * identity across streaming deltas.
 */
export function useGetLatestMessage(
  index: string | number,
  messagesQueryIdOverride?: string | null,
): () => TMessage | null {
  const queryClient = useQueryClient();
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const messagesQueryId = useLatestMessagesQueryId(index, conversationId, messagesQueryIdOverride);

  return useRecoilCallback(
    ({ snapshot }) =>
      (): TMessage | null => {
        if (!messagesQueryId) {
          return null;
        }
        const messages =
          queryClient.getQueryData<TMessage[]>([QueryKeys.messages, messagesQueryId]) ?? [];
        return selectActiveBranchTail(messages, conversationId, (parentId) =>
          snapshot.getLoadable(store.messagesSiblingIdxFamily(parentId)).getValue(),
        );
      },
    [queryClient, conversationId, messagesQueryId],
  );
}
