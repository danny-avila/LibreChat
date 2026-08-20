import { useState, useEffect, useCallback } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { ConversationCursorData, PinnedConversationsData } from '~/utils/convos';
import type { ConvoCandidate } from '~/utils';
import { freshestCandidate, isConversationUnseen } from '~/utils';

export type UnseenConversation = {
  conversationId: string;
  title: string;
  /** The reply that made it unseen; a later one to the same chat is its own arrival. */
  lastResponseAt: string;
};

/** Null until a conversation list has actually resolved, which is not the same as an empty
 *  one: treating "not loaded yet" as "nothing unseen" makes the backlog look like arrivals. */
const readUnseen = (queryClient: QueryClient): UnseenConversation[] | null => {
  /* Keyed rather than first-wins: the same row is cached once per list variant and only the
     mounted ones refetch, so an older copy would otherwise shadow a newer reply and drop it
     from the count. `freshestCandidate` settles which copy is actually current. */
  const byId = new Map<string, ConvoCandidate>();
  let hasList = false;

  const collect = (convo: TConversation, heardAt: number) => {
    const { conversationId } = convo;
    if (!conversationId) {
      return;
    }
    byId.set(
      conversationId,
      freshestCandidate(byId.get(conversationId), { convo, heardAt }) ?? { convo, heardAt },
    );
  };

  const listQueries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of listQueries) {
    const data = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(query.queryKey);
    if (!data) {
      continue;
    }
    hasList = true;
    const heardAt = queryClient.getQueryState(query.queryKey)?.dataUpdatedAt ?? 0;
    for (const page of data.pages) {
      for (const convo of page.conversations) {
        collect(convo, heardAt);
      }
    }
  }

  /* The pinned section is fed by its own request, so a pin older than the loaded chat pages
     lives only here. Skipping it would show that row's dot while the tab count and the alerts
     never counted it. Readiness still keys on the chats list, which is the one the backlog
     arrives in. */
  const pinnedQueries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.pinnedConversations], { exact: false });

  for (const query of pinnedQueries) {
    const data = queryClient.getQueryData<PinnedConversationsData>(query.queryKey);
    if (!data) {
      continue;
    }
    const heardAt = queryClient.getQueryState(query.queryKey)?.dataUpdatedAt ?? 0;
    for (const convo of data.conversations) {
      collect(convo, heardAt);
    }
  }

  if (!hasList) {
    return null;
  }

  const unseen: UnseenConversation[] = [];
  for (const [conversationId, candidate] of byId) {
    const { convo } = candidate;
    const { lastResponseAt } = convo;
    if (isConversationUnseen(convo) && lastResponseAt) {
      unseen.push({ conversationId, title: convo.title ?? '', lastResponseAt });
    }
  }
  return unseen;
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
 * needs no count endpoint. A reply lifts its conversation, so an unseen one normally sits on the
 * first page. "Mark as unread" is the exception: it deliberately leaves `updatedAt` alone, so an
 * old conversation flagged by hand stays where it was and is counted only once its page is
 * loaded. Its own row still shows the indicator; only this aggregate waits.
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
      const root = event?.query?.queryKey?.[0];
      if (root !== QueryKeys.allConversations && root !== QueryKeys.pinnedConversations) {
        return;
      }
      refresh();
    });
    refresh();
    return unsubscribe;
  }, [queryClient, refresh]);

  return unseen;
}
