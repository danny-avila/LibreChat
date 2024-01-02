import copy from 'copy-to-clipboard';
import { useEffect, useState, useRef } from 'react';
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
  const messageRef = useRef<HTMLDivElement>(null);
  const [isExpand, setIsExpand] = useState(false);
  const [showExpand, setShowExpand] = useState(false);

  useEffect(() => {
    const calculateLines = () => {
      if (!messageRef.current) {
        return 1;
      }
      const messageHeight = messageRef.current.clientHeight;
      const lineHeight = parseInt(window.getComputedStyle(messageRef.current).lineHeight);
      const lines = Math.floor(messageHeight / lineHeight);
      return lines;
    };
    const lines = calculateLines();
    if (lines > 3) {
      setShowExpand(true);
    } else {
      setShowExpand(false);
      setIsExpand(true);
    }
  }, [message]);

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

  const handleScroll = () => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  };

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

  const copyToClipboard = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    setIsCopied: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setIsCopied(true);
    copy(text ?? '');
    e.stopPropagation();

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const handleExpand = () => {
    if (!showExpand) {
      return;
    }
    setIsExpand(!isExpand);
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
    messageRef,
    showExpand,
    isExpand,
    handleExpand,
  };
}
