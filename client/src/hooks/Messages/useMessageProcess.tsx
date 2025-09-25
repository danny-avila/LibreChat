import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { getTextKey, logger } from '~/utils';
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
    isSubmitting: isSubmittingRoot,
  } = useChatContext();
  const { isSubmitting: isSubmittingAdditional } = useAddedChatContext();
  const latestMultiMessage = useRecoilValue(store.latestMessageFamily(index + 1));
  const isSubmittingFamily = useMemo(
    () => isSubmittingRoot || isSubmittingAdditional,
    [isSubmittingRoot, isSubmittingAdditional],
  );

  // Track latest message text and update latestMessage state
  useEffect(() => {
    const convoId = conversation?.conversationId;
    if (convoId === Constants.NEW_CONVO || !message || !hasNoChildren) return;

    const textKey = getTextKey(message, convoId);
    const logInfo = {
      textKey,
      'latestText.current': latestText.current,
      messageId: message.messageId,
      convoId,
    };

    if (
      textKey !== latestText.current ||
      (convoId != null &&
        latestText.current &&
        convoId !== latestText.current.split(Constants.COMMON_DIVIDER)[2])
    ) {
      logger.log('latest_message', '[useMessageProcess] Setting latest message; logInfo:', logInfo);
      latestText.current = textKey;
      setLatestMessage({ ...message });
    } else {
      logger.log('latest_message', 'No change in latest message; logInfo', logInfo);
    }
  }, [hasNoChildren, message, setLatestMessage, conversation?.conversationId]);

  // Throttled scroll handler
  const throttledScroll = useRef(
    throttle((isSubmitting: boolean) => {
      setAbortScroll(isSubmitting);
      // Optional minimal logging (can comment out if not needed)
      // logger.log('message_scrolling', `useMessageProcess: setAbortScroll = ${isSubmitting}`);
    }, 500)
  ).current;

  const handleScroll = useCallback(() => {
    throttledScroll(isSubmittingFamily);
  }, [isSubmittingFamily, throttledScroll]);

  // Determine if sibling message should be shown
  const showSibling = useMemo(
    () =>
      (hasNoChildren && latestMultiMessage && (latestMultiMessage.children?.length ?? 0) === 0) ||
      !!siblingMessage,
    [hasNoChildren, latestMultiMessage, siblingMessage],
  );

  // Update sibling message when new multi-message arrives
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
