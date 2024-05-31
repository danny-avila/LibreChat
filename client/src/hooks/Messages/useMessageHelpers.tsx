import { useEffect, useRef, useCallback } from 'react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import { getLatestText, getLengthAndFirstFiveChars } from '~/utils';
import useCopyToClipboard from './useCopyToClipboard';

export default function useMessageHelpers(props: TMessageProps) {
  const latestText = useRef<string | number>('');
  const { message, currentEditId, setCurrentEditId } = props;

  const {
    ask,
    index,
    regenerate,
    isSubmitting,
    conversation,
    latestMessage,
    setAbortScroll,
    handleContinue,
    setLatestMessage,
  } = useChatContext();
  const assistantMap = useAssistantsMapContext();

  const { text, content, children, messageId = null, isCreatedByUser } = message ?? {};
  const edit = messageId === currentEditId;
  const isLast = !children?.length;

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

  const enterEdit = useCallback(
    (cancel?: boolean) => setCurrentEditId && setCurrentEditId(cancel ? -1 : messageId),
    [messageId, setCurrentEditId],
  );

  const handleScroll = useCallback(() => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  }, [isSubmitting, setAbortScroll]);

  const assistant =
    isAssistantsEndpoint(conversation?.endpoint) &&
    assistantMap?.[conversation?.endpoint ?? '']?.[message?.model ?? ''];

  const regenerateMessage = () => {
    if ((isSubmitting && isCreatedByUser) || !message) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = useCopyToClipboard({ text, content });

  return {
    ask,
    edit,
    index,
    isLast,
    assistant,
    enterEdit,
    conversation,
    isSubmitting,
    handleScroll,
    latestMessage,
    handleContinue,
    copyToClipboard,
    regenerateMessage,
  };
}
