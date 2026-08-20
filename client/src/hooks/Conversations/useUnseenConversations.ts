import { useState, useEffect, useCallback } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { ConversationCursorData } from '~/utils/convos';
import { isConversationUnseen } from '~/utils';

export type UnseenConversation = {
  conversationId: string;
  title: string;
  /** The reply that made it unseen; a later one to the same chat is its own arrival. */
  lastResponseAt: string;
};

/** Null until a conversation list has actually resolved, which is not the same as an empty
 *  one: treating "not loaded yet" as "nothing unseen" makes the backlog look like arrivals. */
const readUnseen = (queryClient: QueryClient): UnseenConversation[] | null => {
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  const seenIds = new Set<string>();
  const unseen: UnseenConversation[] = [];
  let hasList = false;

  for (const query of queries) {
    const data = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(query.queryKey);
    if (!data) {
      continue;
    }
    hasList = true;
    for (const page of data.pages) {
      for (const convo of page.conversations) {
        const { conversationId, lastResponseAt } = convo;
        if (!conversationId || seenIds.has(conversationId)) {
          continue;
        }
        seenIds.add(conversationId);
        if (isConversationUnseen(convo) && lastResponseAt) {
          unseen.push({ conversationId, title: convo.title ?? '', lastResponseAt });
        }
      }
    }
  }

  return hasList ? unseen : null;
};

/* Title and reply stamp are part of the identity, not just the id: a conversation is auto-titled
   moments after the reply that made it unseen, and a second reply to an already-unseen chat has
   to reach the alerts as its own arrival. */
const identityOf = (unseen: UnseenConversation[] | null): string =>
  unseen === null
    ? 'pending'
    : JSON.stringify(
        unseen
          .map((c): [string, string, string] => [c.conversationId, c.title, c.lastResponseAt])
          .sort(([a], [b]) => a.localeCompare(b)),
      );

/**
 * The set of conversations that have replied since the user last caught up with them.
 *
 * Derived from the conversation list already in cache, so it costs no request of its own and
 * needs no count endpoint. Unseen conversations are recent by definition and the list sorts by
 * `updatedAt` descending, so they sit on the first page.
 *
 * Subscribing to the query cache (rather than mounting a second list query) avoids duplicating
 * the sidebar's fetch. Cache events are filtered by key before any recomputation, because they
 * also fire for message updates on every streamed token.
 *
 * Returns null while no list has resolved yet, so callers can tell "nothing is unseen" apart
 * from "nothing is known".
 */
export default function useUnseenConversations(): UnseenConversation[] | null {
  const queryClient = useQueryClient();
  const [unseen, setUnseen] = useState<UnseenConversation[] | null>(() => readUnseen(queryClient));

  const refresh = useCallback(() => {
    const next = readUnseen(queryClient);
    setUnseen((current) => (identityOf(current) === identityOf(next) ? current : next));
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] !== QueryKeys.allConversations) {
        return;
      }
      refresh();
    });
    refresh();
    return unsubscribe;
  }, [queryClient, refresh]);

  return unseen;
}
