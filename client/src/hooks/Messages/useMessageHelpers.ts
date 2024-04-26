import copy from 'copy-to-clipboard';
import { useEffect, useRef, useCallback } from 'react';
import { EModelEndpoint, ContentTypes } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import ConversationIcon from '~/components/Endpoints/ConversationIcon';
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

  const { text, content, children, messageId = null, isCreatedByUser } = message ?? {};
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
    conversation?.endpoint === EModelEndpoint.assistants && assistantMap?.[message?.model ?? ''];

  const assistantName = assistant ? (assistant.name as string | undefined) : '';
  const assistantAvatar = assistant ? (assistant.metadata?.avatar as string | undefined) : '';

  const iconEndpoint = message?.endpoint ?? conversation?.endpoint;
  const endpointIconURL = getEndpointField(endpointsConfig, iconEndpoint, 'iconURL');
  const iconURL = message?.iconURL ?? conversation?.iconURL;

  let icon: React.ReactNode | null = null;
  if (iconURL && !message?.isCreatedByUser) {
    icon = ConversationIcon({
      preset: conversation,
      context: 'message',
      assistantAvatar,
      endpointIconURL,
      assistantName,
    });
  } else {
    icon = Icon({
      ...conversation,
      ...(message as TMessage),
      iconURL: !assistant ? endpointIconURL : assistantAvatar,
      model: message?.model ?? conversation?.model,
      assistantName,
      size: 28.8,
    });
  }

  const regenerateMessage = () => {
    if ((isSubmitting && isCreatedByUser) || !message) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = useCallback(
    (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
      setIsCopied(true);
      let messageText = text ?? '';
      if (content) {
        messageText = content.reduce((acc, curr, i) => {
          if (curr.type === ContentTypes.TEXT) {
            return acc + curr.text.value + (i === content.length - 1 ? '' : '\n');
          }
          return acc;
        }, '');
      }
      copy(messageText ?? '');

      setTimeout(() => {
        setIsCopied(false);
      }, 3000);
    },
    [text, content],
  );

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
