import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import useScrollToRef from '~/hooks/useScrollToRef';
import { scrollToMessageStart, hasMessageReachedContainerTop } from '~/utils';
import store from '~/store';

const threshold = 0.85;
const debounceRate = 150;

export default function useMessageScrolling(messagesTree?: TMessage[] | null) {
  const autoScroll = useRecoilValue(store.autoScroll);
  const autoScrollDuringGeneration = useRecoilValue(store.autoScrollDuringGeneration);
  const shouldAutoScrollDuringGeneration = autoScrollDuringGeneration === true;

  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { conversation, conversationId } = useMessagesConversation();
  const { setAbortScroll, isSubmitting, abortScroll } = useMessagesSubmission();
  const trackedGenerationIdRef = useRef<string | null>(null);
  const hasStoppedAtTopRef = useRef(false);

  const timeoutIdRef = useRef<NodeJS.Timeout>();

  const debouncedSetShowScrollButton = useCallback((value: boolean) => {
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      setShowScrollButton(value);
    }, debounceRate);
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        debouncedSetShowScrollButton(!entry.isIntersecting);
      },
      { root: scrollableRef.current, threshold },
    );

    observer.observe(messagesEndRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutIdRef.current);
    };
  }, [messagesEndRef, scrollableRef, debouncedSetShowScrollButton]);

  const debouncedHandleScroll = useCallback(() => {
    if (messagesEndRef.current && scrollableRef.current) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          debouncedSetShowScrollButton(!entry.isIntersecting);
        },
        { root: scrollableRef.current, threshold },
      );
      observer.observe(messagesEndRef.current);
      return () => observer.disconnect();
    }
  }, [debouncedSetShowScrollButton]);

  const scrollCallback = () => debouncedSetShowScrollButton(false);

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: scrollCallback,
    smoothCallback: () => {
      scrollCallback();
      setAbortScroll(false);
    },
  });

  useEffect(() => {
    if (!messagesTree || messagesTree.length === 0) {
      return;
    }

    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    if (!isSubmitting) {
      trackedGenerationIdRef.current = null;
      hasStoppedAtTopRef.current = false;
    }

    if (isSubmitting && scrollToBottom && abortScroll !== true && shouldAutoScrollDuringGeneration) {
      scrollToBottom();
    } else if (isSubmitting && scrollToBottom && abortScroll !== true) {
      if (hasStoppedAtTopRef.current) {
        scrollToBottom.cancel();
        return;
      }

      const container = scrollableRef.current;
      const containerRect = container.getBoundingClientRect();

      // Query the DOM for the last rendered message element rather than using
      // messagesTree[last], because messagesTree is a nested tree where [last] is
      // the root node, not the leaf currently being streamed.
      const allMessageEls = container.querySelectorAll<HTMLElement>(
        '.message-render[id]:not([id=""])',
      );
      const lastMessageEl =
        allMessageEls.length > 0 ? allMessageEls[allMessageEls.length - 1] : null;
      const currentElementId = lastMessageEl?.id ?? null;

      if (trackedGenerationIdRef.current !== currentElementId) {
        trackedGenerationIdRef.current = currentElementId;
        hasStoppedAtTopRef.current = false;
      }

      if (!lastMessageEl || !currentElementId) {
        scrollToBottom();
        return;
      }

      const messageRect = lastMessageEl.getBoundingClientRect();

      // Only apply the boundary check when the element is within scroll range.
      // Elements far above the viewport (old messages that pre-date this generation)
      // must not trigger the stop — their negative top is not a sign we reached them.
      const isWithinScrollRange = messageRect.top >= containerRect.top - containerRect.height;

      if (isWithinScrollRange && hasMessageReachedContainerTop(messageRect.top, containerRect.top)) {
        hasStoppedAtTopRef.current = true;
        setAbortScroll(true);
        scrollToBottom.cancel();
        scrollToMessageStart(currentElementId);
        return;
      }

      const endRect = messagesEndRef.current.getBoundingClientRect();
      const pendingScrollAmount = Math.max(0, endRect.bottom - containerRect.bottom);

      if (
        isWithinScrollRange &&
        pendingScrollAmount > 0 &&
        messageRect.top - pendingScrollAmount <= containerRect.top
      ) {
        hasStoppedAtTopRef.current = true;
        setAbortScroll(true);
        scrollToBottom.cancel();
        scrollToMessageStart(currentElementId);
      } else {
        scrollToBottom();
      }
    } else if (isSubmitting && scrollToBottom && !shouldAutoScrollDuringGeneration) {
      scrollToBottom.cancel();
    }

    return () => {
      if (abortScroll === true) {
        scrollToBottom && scrollToBottom.cancel();
      }
    };
  }, [
    autoScrollDuringGeneration,
    shouldAutoScrollDuringGeneration,
    isSubmitting,
    messagesTree,
    scrollToBottom,
    abortScroll,
    setAbortScroll,
  ]);

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
    scrollableRef,
    messagesEndRef,
    scrollToBottom,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  };
}