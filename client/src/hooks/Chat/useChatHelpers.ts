import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import type { TConversation, TMessage } from 'librechat-data-provider';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

// this to be set somewhere else
export default function useChatHelpers(index = 0, paramId?: string) {
  const clearAllSubmissions = store.useClearSubmissionState();
  const files = useAtomValue(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId } = conversation ?? {};

  const queryParam = paramId === 'new' ? paramId : (conversationId ?? paramId ?? '');

  /* Messages: here simply to fetch, don't export and use `getMessages()` instead */

  const { data: _messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: isAuthenticated,
  });

  const setLatestMessageAtom = useSetAtom(store.latestMessageFamily(index));
  const resetLatestMessage = useCallback(() => setLatestMessageAtom(null), [setLatestMessageAtom]);
  const isSubmitting = useAtomValue(store.isSubmittingFamily(index));
  const latestMessage = useAtomValue(store.latestMessageFamily(index));
  const setSiblingIdx = useSetAtom(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );
  const setFiles = useSetAtom(store.filesByIndex(index));
  const setLatestMessage = useSetAtom(store.latestMessageFamily(index));
  const setIsSubmitting = useSetAtom(store.isSubmittingFamily(index)) as Dispatch<
    SetStateAction<boolean>
  >;
  const setShowPopover = useSetAtom(store.showPopoverFamily(index));
  const setAbortScroll = useSetAtom(store.abortScrollFamily(index));
  const setPreset = useSetAtom(store.presetByIndex(index));
  const setOptionSettings = useSetAtom(store.optionSettingsFamily(index));
  const setShowAgentSettings = useSetAtom(store.showAgentSettingsFamily(index));

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      queryClient.setQueryData<TMessage[]>([QueryKeys.messages, queryParam], messages);
      if (queryParam === 'new' && conversationId && conversationId !== 'new') {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversationId], messages);
      }
    },
    [queryParam, queryClient, conversationId],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam]);
  }, [queryParam, queryClient]);

  const setSubmission = useSetAtom(store.submissionByIndex(index));

  const { ask, regenerate } = useChatFunctions({
    index,
    files,
    setFiles,
    getMessages,
    setMessages,
    isSubmitting,
    conversation,
    latestMessage,
    setSubmission,
    setLatestMessage: setLatestMessage as Dispatch<SetStateAction<TMessage | null>>,
  });

  const continueGeneration = () => {
    if (!latestMessage) {
      console.error('Failed to regenerate the message: latestMessage not found.');
      return;
    }

    const messages = getMessages();

    const parentMessage = messages?.find(
      (element) => element.messageId == latestMessage.parentMessageId,
    );

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isContinued: true, isRegenerate: true, isEdited: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found, or not created by user.',
      );
    }
  };

  const stopGenerating = () => clearAllSubmissions();

  const handleStopGenerating = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    stopGenerating();
  };

  const handleRegenerate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const parentMessageId = latestMessage?.parentMessageId ?? '';
    if (!parentMessageId) {
      console.error('Failed to regenerate the message: parentMessageId not found.');
      return;
    }
    regenerate({ parentMessageId });
  };

  const handleContinue = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    continueGeneration();
    setSiblingIdx(0);
  };

  const showPopover = useAtomValue(store.showPopoverFamily(index));
  const abortScroll = useAtomValue(store.abortScrollFamily(index));
  const preset = useAtomValue(store.presetByIndex(index));
  const optionSettings = useAtomValue(store.optionSettingsFamily(index));
  const showAgentSettings = useAtomValue(store.showAgentSettingsFamily(index));

  return {
    newConversation,
    conversation,
    setConversation: setConversation as Dispatch<SetStateAction<TConversation | null>>,
    isSubmitting,
    setIsSubmitting,
    getMessages,
    setMessages,
    setSiblingIdx,
    latestMessage,
    setLatestMessage,
    resetLatestMessage,
    ask,
    index,
    regenerate,
    stopGenerating,
    handleStopGenerating,
    handleRegenerate,
    handleContinue,
    showPopover,
    setShowPopover,
    abortScroll,
    setAbortScroll,
    preset,
    setPreset,
    optionSettings,
    setOptionSettings,
    showAgentSettings,
    setShowAgentSettings,
    files,
    setFiles,
    filesLoading,
    setFilesLoading,
  };
}
