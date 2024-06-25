import { useRecoilValue } from 'recoil';
import { useCallback, useMemo } from 'react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import { useChatContext, useAddedChatContext, useAssistantsMapContext } from '~/Providers';
import useCopyToClipboard from './useCopyToClipboard';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export type TMessageActions = Pick<
  TMessageProps,
  'message' | 'currentEditId' | 'setCurrentEditId'
> & {
  isMultiMessage?: boolean;
};
export default function useMessageActions(props: TMessageActions) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { message, currentEditId, setCurrentEditId, isMultiMessage } = props;

  const {
    ask,
    index,
    regenerate,
    latestMessage,
    handleContinue,
    setLatestMessage,
    conversation: rootConvo,
    isSubmitting: isSubmittingRoot,
  } = useChatContext();
  const { conversation: addedConvo, isSubmitting: isSubmittingAdditional } = useAddedChatContext();
  const conversation = useMemo(
    () => (isMultiMessage ? addedConvo : rootConvo),
    [isMultiMessage, addedConvo, rootConvo],
  );
  const assistantMap = useAssistantsMapContext();

  const { text, content, messageId = null, isCreatedByUser } = message ?? {};
  const edit = useMemo(() => messageId === currentEditId, [messageId, currentEditId]);

  const enterEdit = useCallback(
    (cancel?: boolean) => setCurrentEditId && setCurrentEditId(cancel ? -1 : messageId),
    [messageId, setCurrentEditId],
  );

  const assistant = useMemo(
    () =>
      isAssistantsEndpoint(conversation?.endpoint) &&
      assistantMap?.[conversation?.endpoint ?? '']?.[message?.model ?? ''],
    [assistantMap, conversation?.endpoint, message?.model],
  );

  const isSubmitting = useMemo(
    () => (isMultiMessage ? isSubmittingAdditional : isSubmittingRoot),
    [isMultiMessage, isSubmittingAdditional, isSubmittingRoot],
  );

  const regenerateMessage = useCallback(() => {
    if ((isSubmitting && isCreatedByUser) || !message) {
      return;
    }

    regenerate(message);
  }, [isSubmitting, isCreatedByUser, message, regenerate]);

  const copyToClipboard = useCopyToClipboard({ text, content });

  const messageLabel = useMemo(() => {
    if (message?.isCreatedByUser) {
      return UsernameDisplay ? user?.name || user?.username : localize('com_user_message');
    } else if (assistant) {
      return assistant.name ?? 'Assistant';
    } else {
      return message?.sender;
    }
  }, [message, assistant, UsernameDisplay, user, localize]);

  return {
    ask,
    edit,
    index,
    assistant,
    enterEdit,
    conversation,
    messageLabel,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    setLatestMessage,
    regenerateMessage,
  };
}
