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
  /** The indicator comes from "mark as unread" on a conversation that has never been replied
   *  to, so the stamp is the manual flag rather than a reply the alerts should announce. */
  flagged: boolean;
};

const MANUAL_FLAG_SLACK_MS = 60_000;

/**
 * Whether a stamp is the manual-unread marker rather than a real reply.
 *
 * A reply moves `updatedAt` with it, while "mark as unread" deliberately leaves it alone
 * (`timestamps: false` server-side), so a stamp running well ahead of `updatedAt` can only be
 * the flag stamped onto a conversation that had never been replied to. Both stamps are written
 * by the server, so the comparison is skew-free; the slack absorbs the jitter between a reply's
 * precomputed stamp and its write time, erring toward announcing.
 */
const isManualFlagStamp = (lastResponseAt: string, updatedAt: string | undefined): boolean => {
  if (updatedAt == null) {
    return false;
  }
  const stamp = Date.parse(lastResponseAt);
  const activity = Date.parse(updatedAt);
  if (Number.isNaN(stamp) || Number.isNaN(activity)) {
    return false;
  }
  return stamp > activity + MANUAL_FLAG_SLACK_MS;
};

export type ReplyReadState = {
  unseen: UnseenConversation[];
  /** The reply stamp of every replied-to conversation in cache, seen rows included. The alerts
   *  baseline on it: a seen conversation marked unread from another device re-enters `unseen`
   *  carrying the stamp it always had, which only this record can tell from a new reply. */
  stamps: Array<[conversationId: string, lastResponseAt: string]>;
};

/** Null until a conversation list has actually resolved, which is not the same as an empty
 *  one: treating "not loaded yet" as "nothing unseen" makes the backlog look like arrivals. */
const readReplyState = (queryClient: QueryClient): ReplyReadState | null => {
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
  const stamps: ReplyReadState['stamps'] = [];
  for (const [conversationId, candidate] of byId) {
    const { convo } = candidate;
    const { lastResponseAt } = convo;
    if (!lastResponseAt) {
      continue;
    }
    const flagged = isManualFlagStamp(lastResponseAt, convo.updatedAt);
    /* A manual marker is deliberately left out of the baseline. The reply that later lands on
       a conversation flagged before it ever had one is stamped with `$max`, so a marker
       written in the same moment as that reply's own precomputed stamp is the value that
       survives the write: baselining it would make the arrival look like a stamp this tab had
       already accounted for, and the reply would pass without a chime or a notification.
       Flagged rows never announce anything themselves, so withholding one can only defer an
       announcement to the real reply. */
    if (!flagged) {
      stamps.push([conversationId, lastResponseAt]);
    }
    if (isConversationUnseen(convo)) {
      unseen.push({
        conversationId,
        title: convo.title ?? '',
        lastResponseAt,
        flagged,
      });
    }
  }
  /* Ordered by id so the identity below does not depend on cache scan order. */
  stamps.sort(([a], [b]) => a.localeCompare(b));
  return { unseen, stamps };
};

/* Title and reply stamp are part of the identity, not just the id: a conversation is auto-titled
   moments after the reply that made it unseen, and a second reply to an already-unseen chat has
   to reach the alerts as its own arrival. The seen rows' stamps count too, so the alerts'
   baseline keeps up with replies that were caught up the moment they landed. */
const identityOf = (state: ReplyReadState | null): string =>
  state === null
    ? 'pending'
    : JSON.stringify([
        state.unseen
          .map((c): [string, string, string] => [c.conversationId, c.title, c.lastResponseAt])
          .sort(([a], [b]) => a.localeCompare(b)),
        state.stamps,
      ]);

/**
 * The set of conversations that have replied since the user last caught up with them, alongside
 * the reply stamps of everything the cache knows.
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
export default function useUnseenConversations(): ReplyReadState | null {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ReplyReadState | null>(() => readReplyState(queryClient));

  const refresh = useCallback(() => {
    const next = readReplyState(queryClient);
    setState((current) => (identityOf(current) === identityOf(next) ? current : next));
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

  return state;
}
