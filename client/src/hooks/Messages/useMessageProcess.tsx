import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { getTextKey, TEXT_KEY_DIVIDER, logger } from '~/utils';
import { useMessagesViewContext } from '~/Providers';
import store from '~/store';

export default function useMessageProcess({ message }: { message?: TMessage | null }) {
  const latestText = useRef<string | number>('');
  const [siblingMessage, setSiblingMessage] = useState<TMessage | null>(null);
  const hasNoChildren = useMemo(() => (message?.children?.length ?? 0) === 0, [message]);

  const {
    index,
    conversation,
    latestMessage,
    setAbortScroll,
    setLatestMessage,
    isSubmittingFamily,
  } = useMessagesViewContext();
  const latestMultiMessage = useRecoilValue(store.latestMessageFamily(index + 1));

  useEffect(() => {
    const convoId = conversation?.conversationId;
    if (convoId === Constants.NEW_CONVO) {
      return;
    }
    if (!message) {
      return;
    }
    if (!hasNoChildren) {
      return;
    }

    const textKey = getTextKey(message, convoId);

    // Check for text/conversation change
    const logInfo = {
      textKey,
      'latestText.current': latestText.current,
      messageId: message.messageId,
      convoId,
    };

    /* Extracted convoId from previous textKey (format: messageId|||length|||lastChars|||convoId) */
    let previousConvoId: string | null = null;
    if (
      latestText.current &&
      typeof latestText.current === 'string' &&
      latestText.current.length > 0
    ) {
      const parts = latestText.current.split(TEXT_KEY_DIVIDER);
      previousConvoId = parts[parts.length - 1] || null;
    }

    if (
      textKey !== latestText.current ||
      (convoId != null && previousConvoId != null && convoId !== previousConvoId)
    ) {
      logger.log('latest_message', '[useMessageProcess] Setting latest message; logInfo:', logInfo);
      latestText.current = textKey;
      setLatestMessage({ ...message });
    } else {
      logger.log('latest_message', 'No change in latest message; logInfo', logInfo);
    }
  }, [hasNoChildren, message, setLatestMessage, conversation?.conversationId]);

  const handleScroll = useCallback(
    (event: unknown | TouchEvent | WheelEvent) => {
      throttle(() => {
        logger.log(
          'message_scrolling',
          `useMessageProcess: setting abort scroll to ${isSubmittingFamily}, handleScroll event`,
          event,
        );
        if (isSubmittingFamily) {
          setAbortScroll(true);
        } else {
          setAbortScroll(false);
        }
      }, 500)();
    },
    [isSubmittingFamily, setAbortScroll],
  );

  const showSibling = useMemo(
    () =>
      (hasNoChildren && latestMultiMessage && (latestMultiMessage.children?.length ?? 0) === 0) ||
      !!siblingMessage,
    [hasNoChildren, latestMultiMessage, siblingMessage],
  );

  useEffect(() => {
    if (
      hasNoChildren &&
      latestMultiMessage &&
      latestMultiMessage.conversationId === message?.conversationId
    ) {
      const newSibling = Object.assign({}, latestMultiMessage, {
        parentMessageId: message.parentMessageId,
        depth: message.depth,
      });
      setSiblingMessage(newSibling);
    }
  }, [hasNoChildren, latestMultiMessage, message, setSiblingMessage, latestMessage]);

  return {
    showSibling,
    handleScroll,
    conversation,
    siblingMessage,
    setSiblingMessage,
    isSubmittingFamily,
    latestMultiMessage,
  };
}
