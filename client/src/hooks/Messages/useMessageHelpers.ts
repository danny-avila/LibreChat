import copy from 'copy-to-clipboard';
import { useEffect, useRef, useCallback } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import Icon from '~/components/Endpoints/Icon';
import { useChatContext } from '~/Providers';
import { getEndpointField } from '~/utils';

export default function useMessageHelpers(props: TMessageProps) {
  const latestText = useRef('');
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { message, currentEditId, setCurrentEditId } = props;

  const {
    ask,
    regenerate,
    isSubmitting,
    conversation,
    latestMessage,
    setAbortScroll,
    handleContinue,
    setLatestMessage,
  } = useChatContext();

  const { text, children, messageId = null, isCreatedByUser } = message ?? {};
  const edit = messageId === currentEditId;
  const isLast = !children?.length;

  useEffect(() => {
    if (!message) {
      return;
    } else if (
      isLast &&
      conversation?.conversationId !== 'new' &&
      latestText.current !== message.text
    ) {
      setLatestMessage({ ...message });
      latestText.current = message.text;
    }
  }, [isLast, message, setLatestMessage, conversation?.conversationId]);

  const enterEdit = (cancel?: boolean) =>
    setCurrentEditId && setCurrentEditId(cancel ? -1 : messageId);

  const handleScroll = useCallback(() => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  }, [isSubmitting, setAbortScroll]);

  const icon = Icon({
    ...conversation,
    ...(message as TMessage),
    iconURL: getEndpointField(endpointsConfig, conversation?.endpoint, 'iconURL'),
    model: message?.model ?? conversation?.model,
    size: 28.8,
  });

  const regenerateMessage = () => {
    if ((isSubmitting && isCreatedByUser) || !message) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    setIsCopied(true);
    copy(text ?? '');

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  return {
    ask,
    icon,
    edit,
    isLast,
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
