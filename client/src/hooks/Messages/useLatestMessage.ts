import { useCallback } from 'react';
import { selectorFamily, useRecoilValue } from 'recoil';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
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
  index: string | number,
  select: (messages: TMessage[]) => TData,
): TData | null {
  const queryClient = useQueryClient();
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const queryKey = [QueryKeys.messages, conversationId ?? ''];

  const { data } = useQuery<TMessage[], unknown, TData>(
    queryKey,
    async () => queryClient.getQueryData<TMessage[]>(queryKey) ?? [],
    {
      enabled: false,
      select,
    },
  );

  if (!conversationId) {
    return null;
  }

  return data ?? null;
}

function useLatestMessageSiblingIndexes(index: string | number, conversationId: string | null) {
  const selectParentIds = useCallback(
    (messages: TMessage[]) => getMessageBranchSiblingParentIds(messages, conversationId),
    [conversationId],
  );
  const parentIds = useMessagesCacheSelect(index, selectParentIds) ?? EMPTY_PARENT_IDS;
  return useRecoilValue(siblingIndexesByParentSelector(parentIds));
}

export function useLatestMessage(index: string | number): TMessage | null {
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const siblingIndexes = useLatestMessageSiblingIndexes(index, conversationId);
  const select = useCallback(
    (messages: TMessage[]) =>
      selectActiveBranchTail(
        messages,
        conversationId,
        (parentId) => siblingIndexes[getParentLookupKey(parentId)] ?? 0,
      ),
    [conversationId, siblingIndexes],
  );

  return useMessagesCacheSelect(index, select);
}

export function useLatestMessageId(index: string | number): string | null {
  const conversationId = useRecoilValue(store.conversationIdByIndex(index));
  const siblingIndexes = useLatestMessageSiblingIndexes(index, conversationId);
  const select = useCallback(
    (messages: TMessage[]) =>
      selectActiveBranchTail(
        messages,
        conversationId,
        (parentId) => siblingIndexes[getParentLookupKey(parentId)] ?? 0,
      )?.messageId ?? null,
    [conversationId, siblingIndexes],
  );

  return useMessagesCacheSelect(index, select);
}
