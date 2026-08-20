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
 * Four events can satisfy those conditions, and all four are already available without polling:
 * the messages-end intersection flipping, a response finishing while the user sits at the bottom,
 * the window regaining focus on a conversation left open, and the list cache itself reporting the
 * conversation (a direct-URL open fires the initial intersection before the list query resolves).
 * Each one re-checks imperatively against the cached list rather than subscribing to it, which
 * keeps the check off the render path.
 *
 * The unseen check is also the cost guard: re-reading a conversation already caught up sends
 * nothing.
 */
export default function useConversationSeen(
  conversationId: string | undefined,
  isSubmitting: boolean,
) {
  const queryClient = useQueryClient();
  const { mutate: markSeen } = useMarkConversationSeenMutation();
  const isNearBottomRef = useRef(false);
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
      if (
        root !== QueryKeys.allConversations &&
        root !== QueryKeys.pinnedConversations &&
        root !== QueryKeys.conversation
      ) {
        return;
      }
      markSeenIfCaughtUp();
    });
    return unsubscribe;
  }, [queryClient, markSeenIfCaughtUp]);

  return reportNearBottom;
}
