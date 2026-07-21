import { useRef, useCallback, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import { reconcileMessageContentLayout } from './messageLayout';
import useScrollToRef from '~/hooks/useScrollToRef';
import store from '~/store';

const resizeFollowThreshold = 120;

export default function useMessageScrolling(messagesTree?: TMessage[] | null) {
  const autoScroll = useRecoilValue(store.autoScroll);

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const suppressNextResizeFollowRef = useRef(false);
  const { conversation, conversationId } = useMessagesConversation();
  const { setAbortScroll, isSubmitting, abortScroll } = useMessagesSubmission();

  const getIsNearBottom = useCallback(() => {
    const scrollEl = scrollableRef.current;
    if (!scrollEl) {
      return true;
    }
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    return distance <= resizeFollowThreshold;
  }, []);

  /** The scroll-to-bottom button owns the IntersectionObserver (so its
   * visibility state never re-renders the message tree host) and reports
   * intersection back through this callback. */
  const handleNearBottomChange = useCallback((isNearBottom: boolean) => {
    isNearBottomRef.current = isNearBottom;
  }, []);

  const debouncedHandleScroll = useCallback(() => {
    isNearBottomRef.current = getIsNearBottom();
  }, [getIsNearBottom]);

  const scrollCallback = () => {
    reconcileMessageContentLayout(scrollableRef.current);
    isNearBottomRef.current = true;
  };

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: scrollCallback,
    smoothCallback: () => {
      scrollCallback();
      setAbortScroll(false);
    },
  });

  const clampScrollToContent = useCallback(() => {
    const scrollEl = scrollableRef.current;
    if (!scrollEl) {
      return false;
    }

    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    if (scrollEl.scrollTop <= maxScrollTop) {
      return false;
    }

    scrollEl.scrollTop = maxScrollTop;
    isNearBottomRef.current = getIsNearBottom();
    return true;
  }, [getIsNearBottom]);

  const reconcileContentResize = useCallback(
    (shouldFollowResize = true) => {
      if (clampScrollToContent()) {
        return;
      }

      if (suppressNextResizeFollowRef.current) {
        suppressNextResizeFollowRef.current = false;
        isNearBottomRef.current = getIsNearBottom();
        return;
      }

      if (shouldFollowResize && isSubmitting && abortScroll !== true && isNearBottomRef.current) {
        scrollToBottom?.();
      }
    },
    [abortScroll, clampScrollToContent, getIsNearBottom, isSubmitting, scrollToBottom],
  );

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => reconcileContentResize());
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [reconcileContentResize]);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) {
      return;
    }

    const suppressNextResizeFollow = () => {
      suppressNextResizeFollowRef.current = true;
    };

    contentEl.addEventListener('pointerdown', suppressNextResizeFollow, true);
    contentEl.addEventListener('keydown', suppressNextResizeFollow, true);
    return () => {
      contentEl.removeEventListener('pointerdown', suppressNextResizeFollow, true);
      contentEl.removeEventListener('keydown', suppressNextResizeFollow, true);
    };
  }, []);

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (isSubmitting && scrollToBottom && abortScroll !== true) {
      scrollToBottom();
    }

    return () => {
      if (abortScroll === true) {
        scrollToBottom && scrollToBottom.cancel();
      }
    };
  }, [isSubmitting, messagesTree, scrollToBottom, abortScroll]);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (scrollToBottom && autoScroll && conversationId !== Constants.NEW_CONVO) {
      scrollToBottom();
    }
  }, [autoScroll, conversationId, scrollToBottom]);

  return {
    conversation,
    contentRef,
    scrollableRef,
    messagesEndRef,
    scrollToBottom,
    handleSmoothToRef,
    debouncedHandleScroll,
    handleNearBottomChange,
  };
}
