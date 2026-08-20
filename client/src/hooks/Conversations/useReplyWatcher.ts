import { useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import { findConvoInAllQueries, updateConvoInAllQueries } from '~/utils';
import { useActiveJobs } from '~/data-provider';
import store from '~/store';

const AWAY_POLL_MS = 30_000;

/**
 * Timestamps are the only thing worth taking from a fresher copy; everything else in the row is
 * either already current or derived per list request.
 *
 * Writes only when a timestamp actually differs: an unchanged `setQueryData` would still bump the
 * list query's `dataUpdatedAt`, keeping it permanently inside its stale window and silently
 * disabling the sidebar's refetch on window focus.
 */
const mergeTimestamps = (queryClient: QueryClient, convo: Partial<TConversation>): void => {
  const { conversationId, lastResponseAt, lastSeenAt } = convo;
  if (!conversationId || !lastResponseAt) {
    return;
  }
  const cached = findConvoInAllQueries(queryClient, conversationId);
  if (
    cached &&
    cached.lastResponseAt === lastResponseAt &&
    cached.lastSeenAt === (lastSeenAt ?? undefined)
  ) {
    return;
  }
  updateConvoInAllQueries(queryClient, conversationId, (current) => ({
    ...current,
    lastResponseAt,
    lastSeenAt,
  }));
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
        .catch(() => {
          /* The conversation may have been deleted while it generated. */
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
        const { conversations } = await dataService.listConversations();
        const unknownIds = new Set<string>();
        let hasNewlyUnknownConversation = false;

        for (const convo of conversations) {
          const { conversationId } = convo;
          if (!conversationId) {
            continue;
          }
          if (findConvoInAllQueries(queryClient, conversationId)) {
            mergeTimestamps(queryClient, convo);
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
        unknownIdsRef.current = unknownIds;

        if (hasNewlyUnknownConversation) {
          queryClient.invalidateQueries([QueryKeys.allConversations]);
        }
      } catch {
        /* Offline or a dropped connection; the next tick retries. */
      }
    };

    const timer = window.setInterval(poll, AWAY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [notificationsEnabled, soundEnabled, badgeEnabled, queryClient]);
}
