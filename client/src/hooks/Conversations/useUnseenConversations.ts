import { useRef, useState, useEffect, useCallback } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { Query, QueryClient, InfiniteData } from '@tanstack/react-query';
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

/**
 * Whether a stamp is the manual-unread marker rather than a real reply.
 *
 * "Mark as unread" copies the conversation's own `updatedAt` into the stamp and leaves the
 * activity date alone (`timestamps: false` server-side), so the two being exactly equal is the
 * marker's signature: a reply writes its stamp separately from the activity date it bumps, and
 * the two never land on the same millisecond. Both values come from the server, so the
 * comparison is skew-free, and unlike a time window it holds however recently the conversation
 * was last active.
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
  return stamp === activity;
};

export type ReplyReadState = {
  unseen: UnseenConversation[];
  /** The reply stamp of every replied-to conversation in cache, seen rows included. The alerts
   *  baseline on it: a seen conversation marked unread from another device re-enters `unseen`
   *  carrying the stamp it always had, which only this record can tell from a new reply. */
  stamps: Array<[conversationId: string, lastResponseAt: string]>;
};

/**
 * How long an unmounted list variant keeps counting toward the aggregate.
 *
 * A variant nobody is looking at can list a conversation that has since been deleted or
 * archived on another device: refetching the mounted list removes the row there and nowhere
 * else, and absence never supersedes presence in the scan below, so the leftover would hold a
 * phantom dot in the badge and the alerts for the rest of the cache's lifetime. A recently
 * refreshed variant still counts, which is what keeps a conversation visible across a filter
 * switch; past this age an unmounted snapshot is no longer treated as authoritative.
 *
 * Measured from the variant's last answer from the server, not from its `dataUpdatedAt`: every
 * local cache write touches all of them, so an unrelated rename or reply stamp would otherwise
 * keep renewing a leftover indefinitely.
 */
const LEFTOVER_CACHE_AGE_MS = 5 * 60_000;

/** How often the aggregate re-checks that deadline on its own; see the effect below. */
const LEFTOVER_SWEEP_MS = 60_000;

const isLeftover = (query: Query, serverFetchedAt: Map<string, number>): boolean => {
  if (query.getObserversCount() > 0) {
    return false;
  }
  const lastAnswer = serverFetchedAt.get(query.queryHash) ?? query.state.dataUpdatedAt;
  return Date.now() - lastAnswer > LEFTOVER_CACHE_AGE_MS;
};

/** Null until a conversation list has actually resolved, which is not the same as an empty
 *  one: treating "not loaded yet" as "nothing unseen" makes the backlog look like arrivals. */
const readReplyState = (
  queryClient: QueryClient,
  serverFetchedAt: Map<string, number>,
): ReplyReadState | null => {
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
    const heardAt = queryClient.getQueryState(query.queryKey)?.dataUpdatedAt ?? 0;
    if (!data || isLeftover(query, serverFetchedAt)) {
      continue;
    }
    hasList = true;
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
    const heardAt = queryClient.getQueryState(query.queryKey)?.dataUpdatedAt ?? 0;
    if (!data || isLeftover(query, serverFetchedAt)) {
      continue;
    }
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
  /** When each cached list variant last heard from the server, keyed by query hash. Seeded
   *  from `dataUpdatedAt` the first time a variant is seen and advanced only by a fetch:
   *  `setQueryData` refreshes `dataUpdatedAt` on every variant, including the ones nothing is
   *  looking at, and that must not renew a leftover. */
  const serverFetchedAt = useRef<Map<string, number>>(new Map());
  const [state, setState] = useState<ReplyReadState | null>(() =>
    readReplyState(queryClient, serverFetchedAt.current),
  );

  const refresh = useCallback(() => {
    const next = readReplyState(queryClient, serverFetchedAt.current);
    setState((current) => (identityOf(current) === identityOf(next) ? current : next));
  }, [queryClient]);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const record = (query: Query, fromServer: boolean) => {
      if (fromServer) {
        serverFetchedAt.current.set(query.queryHash, Date.now());
        return;
      }
      if (!serverFetchedAt.current.has(query.queryHash)) {
        /* First sight of a variant this hook did not watch arrive. Its `dataUpdatedAt` is the
           closest thing to an answer time; a variant that has none yet counts as current until
           its first fetch says otherwise, rather than being written off unseen. */
        serverFetchedAt.current.set(query.queryHash, query.state.dataUpdatedAt || Date.now());
      }
    };

    for (const query of cache.getAll()) {
      const root = query.queryKey?.[0];
      if (root === QueryKeys.allConversations || root === QueryKeys.pinnedConversations) {
        record(query, false);
      }
    }

    const unsubscribe = cache.subscribe((event) => {
      const { query } = event;
      const root = query.queryKey?.[0];
      if (root !== QueryKeys.allConversations && root !== QueryKeys.pinnedConversations) {
        return;
      }
      /* `manual` is what `setQueryData` sets; only a fetch that actually answered counts as
         the variant hearing from the server. */
      const fromServer =
        event.type === 'updated' && event.action.type === 'success' && event.action.manual !== true;
      record(query, fromServer);
      refresh();
    });
    refresh();
    /* Crossing the leftover deadline is not a cache event, so an otherwise idle tab would keep
       counting a phantom row until something else happened to touch the caches. Recomputing on
       a slow tick costs a scan of what is already in memory and no request. */
    const tick = window.setInterval(refresh, LEFTOVER_SWEEP_MS);
    return () => {
      window.clearInterval(tick);
      unsubscribe();
    };
  }, [queryClient, refresh]);

  return state;
}
