import { useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { findConvoInAllQueries, isConversationUnseen } from '~/utils';
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
    /* Names the reply that is actually on screen: the server acknowledges that one and no
       newer, so a reply persisted from another device mid-request stays unseen. */
    markSeen({ conversationId, lastResponseAt: cached?.lastResponseAt });
  }, [conversationId, queryClient, markSeen]);

  /** Stable across renders so the memoized scroll observer is not torn down on every check. */
  const reportNearBottom = useCallback(
    (isNearBottom: boolean) => {
      isNearBottomRef.current = isNearBottom;
      markSeenIfCaughtUp();
    },
    [markSeenIfCaughtUp],
  );

  /* A fresh conversation's scroll position is unknown until its observer reports; inheriting
     "near bottom" from the previous conversation would mark it seen sight unseen. */
  useEffect(() => {
    isNearBottomRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    markSeenIfCaughtUp();
  }, [isSubmitting, markSeenIfCaughtUp]);

  useEffect(() => {
    window.addEventListener('focus', markSeenIfCaughtUp);
    return () => window.removeEventListener('focus', markSeenIfCaughtUp);
  }, [markSeenIfCaughtUp]);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query?.queryKey?.[0] !== QueryKeys.allConversations) {
        return;
      }
      markSeenIfCaughtUp();
    });
    return unsubscribe;
  }, [queryClient, markSeenIfCaughtUp]);

  return reportNearBottom;
}
