import { useRecoilValue } from 'recoil';
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { getLatestText, getLengthAndFirstFiveChars } from '~/utils';
import store from '~/store';

export default function useMessageProcess({ message }: { message?: TMessage | null }) {
  const latestText = useRef<string | number>('');
  const hasNoChildren = useMemo(() => !message?.children?.length, [message]);
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
  const isSubmittingFamily = useMemo(
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
    if (!hasNoChildren) {
      return;
    }

    const text = getLatestText(message);
    const textKey = `${message?.messageId ?? ''}${getLengthAndFirstFiveChars(text)}`;

    if (textKey === latestText.current) {
      return;
    }

    latestText.current = textKey;
    setLatestMessage({ ...message });
  }, [hasNoChildren, message, setLatestMessage, conversation?.conversationId]);

  const handleScroll = useCallback(() => {
    if (isSubmittingFamily) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  }, [isSubmittingFamily, setAbortScroll]);

  const showSibling = useMemo(
    () =>
      (hasNoChildren && latestMultiMessage && !latestMultiMessage?.children?.length) ||
      siblingMessage,
    [hasNoChildren, latestMultiMessage, siblingMessage],
  );

  useEffect(() => {
    if (
      hasNoChildren &&
      latestMultiMessage &&
      latestMultiMessage.conversationId === message?.conversationId
    ) {
      const newSibling = Object.assign({}, latestMultiMessage, {
        parentMessageId: message?.parentMessageId,
        depth: message?.depth,
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
