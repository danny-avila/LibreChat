import copy from 'copy-to-clipboard';
import { useEffect, useRef, useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';
import { getEndpointField } from '~/utils';

export default function useMessageHelpers(props: TMessageProps) {
  const latestText = useRef<string | number>('');
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
  const assistantMap = useAssistantsMapContext();

  const { text, children, messageId = null, isCreatedByUser } = message ?? {};
  const edit = messageId === currentEditId;
  const isLast = !children?.length;

  useEffect(() => {
    let contentChanged = message?.content
      ? message?.content?.length !== latestText.current
      : message?.text !== latestText.current;

    if (!isLast) {
      contentChanged = false;
    }

    if (!message) {
      return;
    } else if (isLast && conversation?.conversationId !== 'new' && contentChanged) {
      setLatestMessage({ ...message });
      latestText.current = message?.content ? message.content.length : message.text;
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

  const assistant =
    conversation?.endpoint === EModelEndpoint.assistants && assistantMap?.[message?.model ?? ''];

  const icon = Icon({
    ...conversation,
    ...(message as TMessage),
    iconURL: !assistant
      ? getEndpointField(endpointsConfig, conversation?.endpoint, 'iconURL')
      : (assistant?.metadata?.avatar as string | undefined) ?? '',
    model: message?.model ?? conversation?.model,
    assistantName: assistant ? (assistant.name as string | undefined) : '',
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
