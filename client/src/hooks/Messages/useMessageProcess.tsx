import { useRecoilValue } from 'recoil';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { getLatestText, getLengthAndFirstFiveChars } from '~/utils';
import store from '~/store';

export default function useMessageProcess({ message }: { message?: TMessage | null }) {
  const latestText = useRef<string | number>('');
  const isLast = useMemo(() => !message?.children?.length, [message]);
  const [siblingMessage, setSiblingMessage] = useState<TMessage | null>(null);

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
  const isSubmitting = useMemo(
    () => isSubmittingRoot || isSubmittingAdditional,
    [isSubmittingRoot, isSubmittingAdditional],
  );

  useEffect(() => {
    if (conversation?.conversationId === 'new') {
      return;
    }
    if (!message) {
      return;
    }
    if (!isLast) {
      return;
    }

    const text = getLatestText(message);
    const textKey = `${message?.messageId ?? ''}${getLengthAndFirstFiveChars(text)}`;

    if (textKey === latestText.current) {
      return;
    }

    latestText.current = textKey;
    setLatestMessage({ ...message });
  }, [isLast, message, setLatestMessage, conversation?.conversationId]);

  const handleScroll = useCallback(() => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  }, [isSubmitting, setAbortScroll]);

  const showSibling = useMemo(
    () => (isLast && latestMultiMessage && !latestMultiMessage?.children?.length) || siblingMessage,
    [isLast, latestMultiMessage, siblingMessage],
  );

  useEffect(() => {
    if (
      isLast &&
      latestMultiMessage &&
      latestMultiMessage.conversationId === message?.conversationId
    ) {
      setSiblingMessage(latestMultiMessage);
    }
  }, [isLast, latestMultiMessage, message, setSiblingMessage, latestMessage]);

  return {
    showSibling,
    handleScroll,
    conversation,
    siblingMessage,
    setSiblingMessage,
    latestMultiMessage,
  };
}
