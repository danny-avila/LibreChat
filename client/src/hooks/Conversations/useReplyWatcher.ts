import { useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import {
  isNotFoundError,
  findConvoInAllQueries,
  updateConvoInAllQueries,
  isConvoInAggregateCaches,
} from '~/utils';
import { useActiveJobs } from '~/data-provider';
import store from '~/store';

const AWAY_POLL_MS = 30_000;
/**
 * How many conversations one away poll looks at.
 *
 * A reply lifts its conversation, so the newest activity is what the first page holds. The
 * server's default of 25 is the number that has to cover everything replied to between two
 * ticks, which a batch of scheduled runs can exceed; asking for more costs the same single
 * request. It is a ceiling rather than a guarantee: draining the cursor on a poll that repeats
 * every thirty seconds is the wrong trade, and covering it properly wants an unseen query on
 * the server rather than a wider page here.
 */
const AWAY_POLL_LIMIT = 100;

/**
 * Timestamps are the only thing worth taking from a fresher copy; everything else in the row is
 * either already current or derived per list request.
 *
 * `updatedAt` rides along and the row moves to the top, because a reply now advances `updatedAt`
 * server-side: leaving the cached copy behind would show a conversation that just became active
 * still sitting at its old date and position. The same write also refreshes the list query's
 * `dataUpdatedAt`, so a stale row could otherwise survive the next focus refetch.
 *
 * Writes only when something actually differs: an unchanged `setQueryData` would still bump that
 * `dataUpdatedAt`, keeping the query permanently inside its stale window and silently disabling
 * the sidebar's refetch on window focus.
 */
const mergeTimestamps = async (
  queryClient: QueryClient,
  convo: Partial<TConversation>,
): Promise<void> => {
  const { conversationId, lastResponseAt, lastSeenAt, updatedAt } = convo;
  if (!conversationId || !lastResponseAt) {
    return;
  }
  const cached = findConvoInAllQueries(queryClient, conversationId);
  if (
    cached &&
    cached.lastResponseAt === lastResponseAt &&
    cached.lastSeenAt === (lastSeenAt ?? undefined) &&
    (updatedAt === undefined || cached.updatedAt === updatedAt)
  ) {
    return;
  }

  /* A job completing on another device can belong to a conversation the chats list has never
     loaded, and the writes below only reach rows that already exist. Hand-inserting one would
     fight the list's own ordering and pagination, so the list is refetched instead, exactly as
     the away poll does when it meets an id it does not know.
     Keyed on the caches the unseen aggregate actually reads: a conversation opened by URL sits
     in its own point query, which is enough for the lookup above but invisible to the badge and
     the alerts, so it still needs the list. */
  if (!isConvoInAggregateCaches(queryClient, conversationId)) {
    queryClient.invalidateQueries([QueryKeys.allConversations]);
    if (!cached) {
      return;
    }
  }

  /* Two fetches for the same conversation can resolve out of order: overlapping away polls, or
     completion fetches for concurrent jobs. Taking the older one would walk the read state
     backwards and either drop a dot or bring one back. A snapshot is accepted whole or not at
     all, since its two stamps come from one server read and `lastSeenAt` legitimately clears
     when another device marks the conversation unread. */
  if (cached?.lastResponseAt != null && lastResponseAt < cached.lastResponseAt) {
    return;
  }

  /* Awaited, and before the stamp. A reply this tab never streamed is not in the rendered
     tree, and exposing the stamp first would let the seen trigger acknowledge it from a scroll
     position that belongs to the previous message. Invalidation resolves once the active
     refetch has landed, so the conversation the user is looking at is showing the reply by the
     time it can be credited; anywhere else the query is unmounted, nothing is fetched and this
     resolves immediately. */
  const messagesKey = [QueryKeys.messages, conversationId];
  await queryClient.invalidateQueries(messagesKey);
  /* Invalidation settles rather than throwing when the refetch fails, so the failure has to be
     read off the query itself. Exposing the stamp anyway would let the seen trigger credit a
     reply the tab never managed to load; the next poll retries.
     Only an observed query counts: invalidation refetches those, so its error is this attempt's.
     A cached error left behind by a conversation the user has since closed never clears, and
     reading it would withhold that conversation's stamp for the rest of the session. */
  const messagesQuery = queryClient.getQueryCache().find(messagesKey);
  const isObserved = (messagesQuery?.getObserversCount() ?? 0) > 0;
  if (isObserved && messagesQuery?.state.status === 'error') {
    return;
  }

  /* The await above is a real network wait while the conversation is open, and a newer stamp
     can land during it: the SSE final handler, or a fresher overlapping fetch. Writing this
     snapshot over that would walk the read state backwards after the newer reply's signal was
     already consumed, so the ordering guard runs again against what the cache holds now, and
     an unchanged row is left alone for the same `dataUpdatedAt` reason as above. */
  const fresh = findConvoInAllQueries(queryClient, conversationId);
  if (fresh?.lastResponseAt != null && lastResponseAt < fresh.lastResponseAt) {
    return;
  }
  if (
    fresh &&
    fresh.lastResponseAt === lastResponseAt &&
    fresh.lastSeenAt === (lastSeenAt ?? undefined) &&
    (updatedAt === undefined || fresh.updatedAt === updatedAt)
  ) {
    return;
  }

  updateConvoInAllQueries(
    queryClient,
    conversationId,
    (current) => ({
      ...current,
      lastResponseAt,
      lastSeenAt,
      updatedAt: updatedAt ?? current.updatedAt,
    }),
    /* Reordering only when the server says the conversation moved; a bare read-state merge
       must not jump the row. */
    updatedAt !== undefined && fresh?.updatedAt !== updatedAt,
  );
};

/**
 * Notices replies that finish without this tab holding the stream.
 *
 * `finalHandler` covers the tab that is sitting on the conversation, but navigating elsewhere
 * closes the SSE connection by design, and a run started on another device was never attached
 * here at all. Both cases feed the same unseen pipeline once the timestamps reach the cache, so
 * this hook only has to get them there.
 *
 * Two paths, because one signal cannot cover both cheaply:
 *
 * - **Foreground.** `useActiveJobs` is already mounted by the sidebar and already polls while any
 *   job runs, so watching an id leave that set costs no extra request. Completion then fetches
 *   just that conversation rather than refetching the whole list, unless the cache was already
 *   stamped by the tab that held the stream.
 * - **Away.** Job-set watching is unreliable here: a short run can start and finish between two
 *   polls, leaving no transition to observe. Polling the first page of the list instead reports
 *   the reply whether or not the job was ever seen running. Gated on any of the three away
 *   features (notifications, sound, tab badge), so the request only exists for someone who
 *   asked to be told or shown something while away.
 */
export default function useReplyWatcher() {
  const queryClient = useQueryClient();
  const notificationsEnabled = useRecoilValue(store.replyNotifications);
  const soundEnabled = useRecoilValue(store.replyNotificationSound);
  const badgeEnabled = useRecoilValue(store.unseenTabBadge);
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = activeJobsData?.activeJobIds;
  const runningRef = useRef<Set<string> | null>(null);
  const observedStampRef = useRef<Map<string, string | undefined>>(new Map());
  const unknownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    /* `useActiveJobs` does not retry: a failed poll reads as no information, not as
       every running job having finished. */
    if (activeJobIds === undefined) {
      return;
    }
    const running = new Set(activeJobIds);
    const previous = runningRef.current;
    runningRef.current = running;

    /* What the cache held when the job was first seen running. Comparing that against what it
       holds at completion answers "did anything stamp this?" without ordering a server-stamped
       timestamp against the browser clock, which skew alone could invert. */
    for (const conversationId of running) {
      if (!observedStampRef.current.has(conversationId)) {
        observedStampRef.current.set(
          conversationId,
          findConvoInAllQueries(queryClient, conversationId)?.lastResponseAt,
        );
      }
    }

    if (previous === null) {
      return;
    }

    for (const conversationId of previous) {
      if (running.has(conversationId)) {
        continue;
      }
      const stampWhenObserved = observedStampRef.current.get(conversationId);
      observedStampRef.current.delete(conversationId);
      /* The tab holding the stream stamps the list cache in its final handler; when the stamp
         has already moved since this tab saw the job start, the fetch is redundant. */
      const cachedStamp = findConvoInAllQueries(queryClient, conversationId)?.lastResponseAt;
      if (cachedStamp !== undefined && cachedStamp !== stampWhenObserved) {
        continue;
      }
      dataService
        .getConversationById(conversationId)
        .then((convo) => mergeTimestamps(queryClient, convo))
        .catch((error: unknown) => {
          /* Deleted while it generated is the only terminal answer. Anything else has
             consumed the one completion transition this tab will see, and with the away poll
             gated on the document being unfocused, nothing would deliver the reply's stamp
             while the user stays here; the list refetch is the same recovery the poll uses
             for an unknown id. The messages go stale first so an open conversation refetches
             the reply and the seen trigger holds until it has rendered. */
          if (isNotFoundError(error)) {
            return;
          }
          queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
          queryClient.invalidateQueries([QueryKeys.allConversations]);
        });
    }
  }, [activeJobIds, queryClient]);

  useEffect(() => {
    if (!notificationsEnabled && !soundEnabled && !badgeEnabled) {
      return;
    }

    const poll = async () => {
      if (document.hasFocus()) {
        return;
      }
      try {
        /* The default page is the newest conversations, which is where an unseen reply always
           lands: the list sorts by `updatedAt` descending. */
        const { conversations } = await dataService.listConversations({
          limit: AWAY_POLL_LIMIT,
        });
        const unknownIds = new Set<string>();
        let hasNewlyUnknownConversation = false;

        for (const convo of conversations) {
          const { conversationId } = convo;
          if (!conversationId) {
            continue;
          }
          if (findConvoInAllQueries(queryClient, conversationId)) {
            await mergeTimestamps(queryClient, convo);
            continue;
          }
          /* A conversation started on another device has no row here to merge into, and hand-
             inserting one would fight the list's own ordering and pagination state. With a
             sidebar filter cached, a conversation can also stay unknown forever, so only a
             newly unknown id is worth a refetch. */
          if (!unknownIdsRef.current.has(conversationId)) {
            hasNewlyUnknownConversation = true;
          }
          unknownIds.add(conversationId);
        }

        if (!hasNewlyUnknownConversation) {
          unknownIdsRef.current = unknownIds;
          return;
        }
        /* Ids are committed as known-unknown only once the refetch meant to reveal them has
           succeeded. Recording them first would let a transient list failure mute those
           conversations for good: every later poll would read them as already known and never
           invalidate again, even after the network recovered. A conversation a cached sidebar
           filter legitimately hides is committed on the successful refetch that still did not
           reveal it, which is what keeps the filtered list from being refetched every tick. */
        await queryClient.invalidateQueries([QueryKeys.allConversations]);
        const refreshFailed = queryClient
          .getQueryCache()
          .findAll([QueryKeys.allConversations], { exact: false })
          .some((query) => query.getObserversCount() > 0 && query.state.status === 'error');
        if (!refreshFailed) {
          unknownIdsRef.current = unknownIds;
        }
      } catch {
        /* Offline or a dropped connection; the next tick retries. */
      }
    };

    const timer = window.setInterval(poll, AWAY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [notificationsEnabled, soundEnabled, badgeEnabled, queryClient]);
}
