import throttle from 'lodash/throttle';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import { useMessagesViewContext, useAssistantsMapContext, useAgentsMapContext } from '~/Providers';
import { getTextKey, TEXT_KEY_DIVIDER, logger } from '~/utils';
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
  } = useMessagesViewContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();

  const { text, content, children, messageId = null, isCreatedByUser } = message ?? {};
  const edit = messageId === currentEditId;
  const isLast = children?.length === 0 || children?.length === undefined;

  useEffect(() => {
    const convoId = conversation?.conversationId;
    if (convoId === Constants.NEW_CONVO) {
      return;
    }
    if (!message) {
      return;
    }
    if (!isLast) {
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
      logger.log('latest_message', '[useMessageHelpers] Setting latest message: ', logInfo);
      latestText.current = textKey;
      setLatestMessage({ ...message });
    } else {
      logger.log('latest_message', 'No change in latest message', logInfo);
    }
  }, [isLast, message, setLatestMessage, conversation?.conversationId]);

  const enterEdit = useCallback(
    (cancel?: boolean) => setCurrentEditId && setCurrentEditId(cancel === true ? -1 : messageId),
    [messageId, setCurrentEditId],
  );

  const handleScroll = useCallback(
    (event: unknown) => {
      throttle(() => {
        logger.log(
          'message_scrolling',
          `useMessageHelpers: setting abort scroll to ${isSubmitting}, handleScroll event`,
          event,
        );
        if (isSubmitting) {
          setAbortScroll(true);
        } else {
          setAbortScroll(false);
        }
      }, 500)();
    },
    [isSubmitting, setAbortScroll],
  );

  const assistant = useMemo(() => {
    if (!isAssistantsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    const endpointKey = conversation?.endpoint ?? '';
    const modelKey = message?.model ?? '';

    return assistantMap?.[endpointKey] ? assistantMap[endpointKey][modelKey] : undefined;
  }, [conversation?.endpoint, message?.model, assistantMap]);

  const agent = useMemo(() => {
    if (!isAgentsEndpoint(conversation?.endpoint)) {
      return undefined;
    }

    const modelKey = message?.model ?? '';

    return agentsMap ? agentsMap[modelKey] : undefined;
  }, [agentsMap, conversation?.endpoint, message?.model]);

  const regenerateMessage = () => {
    if ((isSubmitting && isCreatedByUser === true) || !message) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = useCopyToClipboard({ text, content });

  return {
    ask,
    edit,
    agent,
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
