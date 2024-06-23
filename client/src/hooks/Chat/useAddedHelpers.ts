import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import store from '~/store';

// this to be set somewhere else
export default function useAddedHelpers({
  rootIndex = 0,
  currentIndex,
  paramId,
}: {
  rootIndex?: number;
  currentIndex: number;
  paramId?: string;
}) {
  const queryClient = useQueryClient();

  const clearAllSubmissions = store.useClearSubmissionState();
  const [files, setFiles] = useRecoilState(store.filesByIndex(rootIndex));
  const latestMessage = useRecoilValue(store.latestMessageFamily(rootIndex));
  const setLatestMultiMessage = useSetRecoilState(store.latestMessageFamily(currentIndex));

  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(currentIndex);
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(currentIndex));

  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const queryParam = paramId === 'new' ? paramId : conversation?.conversationId ?? paramId ?? '';

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, queryParam, currentIndex],
        messages,
      );
      const latestMultiMessage = messages[messages.length - 1];
      if (latestMultiMessage) {
        setLatestMultiMessage({ ...latestMultiMessage, depth: -1 });
      }
    },
    [queryParam, queryClient, currentIndex, setLatestMultiMessage],
  );

  const getMessages = useCallback(() => {
    return queryClient.getQueryData<TMessage[]>([QueryKeys.messages, queryParam, currentIndex]);
  }, [queryParam, queryClient, currentIndex]);

  const setSubmission = useSetRecoilState(store.submissionByIndex(currentIndex));

  const { ask, regenerate } = useChatFunctions({
    index: currentIndex,
    files,
    setFiles,
    getMessages,
    setMessages,
    isSubmitting,
    conversation,
    setSubmission,
    latestMessage,
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
    const parentMessageId = latestMessage?.parentMessageId;
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

  return {
    ask,
    regenerate,
    getMessages,
    setMessages,
    conversation,
    isSubmitting,
    setSiblingIdx,
    latestMessage,
    stopGenerating,
    handleContinue,
    setConversation,
    setIsSubmitting,
    handleRegenerate,
    handleStopGenerating,
  };
}
