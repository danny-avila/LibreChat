import { useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { findConvoInAllQueries, isConversationUnseen } from '~/utils';
import { consumeFocusSuppression } from './notificationNavigation';
import { useMarkConversationSeenMutation } from '~/data-provider';

/**
 * Records that the user has caught up with a conversation's newest message.
 *
 * "Seen" deliberately means the newest message reached the viewport while the tab was focused,
 * not merely that the route is open, so a backgrounded tab restoring on reload does not silently
 * clear every indicator.
 *
 * Five events can satisfy those conditions, and all five are already available without polling:
 * the messages-end intersection flipping, a response finishing while the user sits at the bottom,
 * the window regaining focus on a conversation left open, the list cache itself reporting the
 * conversation (a direct-URL open fires the initial intersection before the list query resolves),
 * and the messages query settling a revalidation (a warm-cache open reports the bottom of the
 * old tree before the reply it is acknowledging has rendered). Each one re-checks imperatively
 * against the cached list rather than subscribing to it, which keeps the check off the render
 * path.
 *
 * The unseen check is also the cost guard: re-reading a conversation already caught up sends
 * nothing.
 */
export default function useConversationSeen(
  conversationId: string | undefined,
  isSubmitting: boolean,
  measureNearBottom?: () => boolean | null,
) {
  const queryClient = useQueryClient();
  const { mutate: markSeen } = useMarkConversationSeenMutation();
  const isNearBottomRef = useRef(false);
  /** Read from the deferred revalidation check, which outlives the render that created it. */
  const measureRef = useRef(measureNearBottom);
  measureRef.current = measureNearBottom;
  const pendingFrameRef = useRef<number | null>(null);
  /** The last reply each conversation was acknowledged for. A failed write rolls the cache
   *  back to unseen, which is itself a cache event this hook listens to, so without this the
   *  rejection would immediately re-arm the trigger and spin requests for as long as the
   *  network keeps refusing them. Re-armed by a genuinely newer reply, or by refocusing. */
  const attemptedRef = useRef<Map<string, string | undefined>>(new Map());

  const markSeenIfCaughtUp = useCallback(() => {
    if (!conversationId || conversationId === Constants.NEW_CONVO) {
      return;
    }
    if (!isNearBottomRef.current || !document.hasFocus()) {
      return;
    }
    /* A warm-cache open renders the old tree while the messages query revalidates in the
       background, and that tree's end marker reports the bottom of a reply the user has not
       seen. Acknowledging then would clear the indicator for a message that never rendered,
       so the check waits out the fetch; its success is a cache event the subscription below
       turns into the re-check.
       A failed revalidation returns the query to `idle` while keeping the stale tree on
       screen, so waiting for the fetch to stop is not enough: the acknowledgement waits for a
       fetch that actually succeeded. A query with no state at all is the direct-URL open,
       whose own load is covered by the same subscription. */
    const messagesQueryState = queryClient.getQueryState([QueryKeys.messages, conversationId]);
    if (messagesQueryState != null && messagesQueryState.fetchStatus !== 'idle') {
      return;
    }
    if (messagesQueryState?.status === 'error') {
      return;
    }
    const cached = findConvoInAllQueries(queryClient, conversationId);
    if (!isConversationUnseen(cached)) {
      return;
    }
    const { lastResponseAt } = cached ?? {};
    if (
      attemptedRef.current.has(conversationId) &&
      attemptedRef.current.get(conversationId) === lastResponseAt
    ) {
      return;
    }
    attemptedRef.current.set(conversationId, lastResponseAt);
    /* Names the reply that is actually on screen: the server acknowledges that one and no
       newer, so a reply persisted from another device mid-request stays unseen. */
    markSeen({ conversationId, lastResponseAt });
  }, [conversationId, queryClient, markSeen]);

  /** Refocusing is a deliberate return to the conversation, and a human-paced one, so it is
   *  the right moment to let a write that failed while offline try again. */
  const retryOnFocus = useCallback(() => {
    if (consumeFocusSuppression()) {
      return;
    }
    attemptedRef.current.clear();
    markSeenIfCaughtUp();
  }, [markSeenIfCaughtUp]);

  /** Stable across renders so the memoized scroll observer is not torn down on every check. */
  const reportNearBottom = useCallback(
    (isNearBottom: boolean) => {
      isNearBottomRef.current = isNearBottom;
      markSeenIfCaughtUp();
    },
    [markSeenIfCaughtUp],
  );

  /* A fresh conversation's scroll position is unknown until its observer reports; inheriting
     "near bottom" from the previous conversation would mark it seen sight unseen.
     Arriving also re-arms the attempt guard for this conversation: leaving and coming back is
     a deliberate, human-paced return, the same reason refocusing re-arms it, and the hook
     outlives the route so a write that failed here would otherwise stay suppressed. */
  useEffect(() => {
    isNearBottomRef.current = false;
    if (conversationId) {
      attemptedRef.current.delete(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    markSeenIfCaughtUp();
  }, [isSubmitting, markSeenIfCaughtUp]);

  useEffect(() => {
    window.addEventListener('focus', retryOnFocus);
    return () => window.removeEventListener('focus', retryOnFocus);
  }, [retryOnFocus]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      /* Every root the lookup reads. An old pin lives only in the pinned cache, and a
         conversation opened by URL can be in neither list, resolving into its own point query
         after the messages have already reported the bottom; that arrival is then the last
         trigger left to notice the conversation at all. */
      const root = event?.query?.queryKey?.[0];
      /* Only a messages fetch actually resolving: it is what the revalidation guard above
         waits for, and it means the reply is in cache with its render committing. Streamed
         tokens also land in this cache, but through `setQueryData`, which marks its success
         action manual; re-checking on each of those would scan the lists once per token. */
      if (root === QueryKeys.messages) {
        if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual) {
          return;
        }
        /* Deferred past the commit, because this event fires while the refreshed tree is
           still uncommitted: the near-bottom flag describes the old tree, and the end
           observer only reports on threshold crossings, so a taller reply would be
           acknowledged from a position it has already scrolled away and an unchanged one
           would never re-report at all. Two frames on, the paint has happened and the
           position is re-measured against the tree the user actually sees; without a
           measurer the flag is the best answer left. */
        if (pendingFrameRef.current != null) {
          window.cancelAnimationFrame(pendingFrameRef.current);
        }
        pendingFrameRef.current = window.requestAnimationFrame(() => {
          pendingFrameRef.current = window.requestAnimationFrame(() => {
            pendingFrameRef.current = null;
            const measured = measureRef.current?.() ?? null;
            if (measured != null) {
              isNearBottomRef.current = measured;
            }
            markSeenIfCaughtUp();
          });
        });
        return;
      }
      if (
        root !== QueryKeys.allConversations &&
        root !== QueryKeys.pinnedConversations &&
        root !== QueryKeys.conversation
      ) {
        return;
      }
      markSeenIfCaughtUp();
    });
    return () => {
      unsubscribe();
      if (pendingFrameRef.current != null) {
        window.cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    };
  }, [queryClient, markSeenIfCaughtUp]);

  return reportNearBottom;
}
