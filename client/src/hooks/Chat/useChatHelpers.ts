import { useCallback, useMemo, useRef, useState } from 'react';
import { QueryKeys, isAssistantsEndpoint } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { ActiveJobsResponse } from '~/data-provider';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import { useAbortStreamMutation } from '~/data-provider';
import useNewConvo from '~/hooks/useNewConvo';
import store from '~/store';

// this to be set somewhere else
export default function useChatHelpers(index = 0, paramId?: string) {
  const clearAllSubmissions = store.useClearSubmissionState();
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const queryClient = useQueryClient();
  const abortMutation = useAbortStreamMutation();

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId, endpoint, endpointType } = conversation ?? {};

  /** Use paramId (from URL) as primary source for query key - this must match what ChatView uses
  Falling back to conversationId (Recoil) only if paramId is not available */
  const queryParam = paramId === 'new' ? paramId : (paramId ?? conversationId ?? '');

  const resetLatestMessage = useResetRecoilState(store.latestMessageFamily(index));
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const [latestMessage, setLatestMessage] = useRecoilState(store.latestMessageFamily(index));

  const latestMessageId = latestMessage?.messageId;
  const latestMessageDepth = latestMessage?.depth;
  const latestMessageRef = useRef(latestMessage);
  latestMessageRef.current = latestMessage;

  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

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

  /* Conversation */
  // const setActiveConvos = useSetRecoilState(store.activeConversations);

  // const setConversation = useCallback(
  //   (convoUpdate: TConversation) => {
  //     _setConversation(prev => {
  //       const { conversationId: convoId } = prev ?? { conversationId: null };
  //       const { conversationId: currentId } = convoUpdate;
  //       if (currentId && convoId && convoId !== 'new' && convoId !== currentId) {
  //         // for now, we delete the prev convoId from activeConversations
  //         const newActiveConvos = { [currentId]: true };
  //         setActiveConvos(newActiveConvos);
  //       }
  //       return convoUpdate;
  //     });
  //   },
  //   [_setConversation, setActiveConvos],
  // );

  const setSubmission = useSetRecoilState(store.submissionByIndex(index));

  const { ask: _ask, regenerate: _regenerate } = useChatFunctions({
    index,
    files,
    setFiles,
    getMessages,
    setMessages,
    isSubmitting,
    conversation,
    latestMessage,
    setSubmission,
    setLatestMessage,
  });

  const askRef = useRef(_ask);
  askRef.current = _ask;
  const ask: typeof _ask = useCallback((...args) => askRef.current(...args), []);

  const regenerateRef = useRef(_regenerate);
  regenerateRef.current = _regenerate;
  const regenerate: typeof _regenerate = useCallback(
    (...args) => regenerateRef.current(...args),
    [],
  );

  const continueGeneration = useCallback(() => {
    const currentLatest = latestMessageRef.current;
    if (!currentLatest) {
      console.error('Failed to regenerate the message: latestMessage not found.');
      return;
    }

    const messages = getMessages();

    const parentMessage = messages?.find(
      (element) => element.messageId == currentLatest.parentMessageId,
    );

    if (parentMessage && parentMessage.isCreatedByUser) {
      ask({ ...parentMessage }, { isContinued: true, isRegenerate: true, isEdited: true });
    } else {
      console.error(
        'Failed to regenerate the message: parentMessage not found, or not created by user.',
      );
    }
  }, [getMessages, ask]);

  /**
   * Stop generation - for non-assistants endpoints, calls abort endpoint first.
   * The abort endpoint will cause the backend to emit a `done` event with `aborted: true`,
   * which will be handled by the SSE event handler to clean up UI.
   * Assistants endpoint has its own abort mechanism via useEventHandlers.abortConversation.
   */
  const stopGenerating = useCallback(async () => {
    const actualEndpoint = endpointType ?? endpoint;
    const isAssistants = isAssistantsEndpoint(actualEndpoint);
    console.log('[useChatHelpers] stopGenerating called', {
      conversationId,
      endpoint,
      endpointType,
      actualEndpoint,
      isAssistants,
    });

    // For non-assistants endpoints (using resumable streams), call abort endpoint first
    if (conversationId && !isAssistants) {
      queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
        activeJobIds: (old?.activeJobIds ?? []).filter((id) => id !== conversationId),
      }));

      try {
        console.log('[useChatHelpers] Calling abort mutation for:', conversationId);
        await abortMutation.mutateAsync({ conversationId });
        console.log('[useChatHelpers] Abort mutation succeeded');
        // The SSE will receive a `done` event with `aborted: true` and clean up
        // We still clear submissions as a fallback
        clearAllSubmissions();
      } catch (error) {
        console.error('[useChatHelpers] Abort failed:', error);
        // Fall back to clearing submissions
        clearAllSubmissions();
      }
    } else {
      // For assistants endpoints, just clear submissions (existing behavior)
      console.log('[useChatHelpers] Assistants endpoint, just clearing submissions');
      clearAllSubmissions();
    }
  }, [conversationId, endpoint, endpointType, abortMutation, clearAllSubmissions, queryClient]);

  const handleStopGenerating = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      stopGenerating();
    },
    [stopGenerating],
  );

  const handleRegenerate = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const parentMessageId = latestMessageRef.current?.parentMessageId ?? '';
      if (!parentMessageId) {
        console.error('Failed to regenerate the message: parentMessageId not found.');
        return;
      }
      regenerate({ parentMessageId });
    },
    [regenerate],
  );

  const handleContinue = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      continueGeneration();
      setSiblingIdx(0);
    },
    [continueGeneration, setSiblingIdx],
  );

  const [preset, setPreset] = useRecoilState(store.presetByIndex(index));
  const [showPopover, setShowPopover] = useRecoilState(store.showPopoverFamily(index));
  const [abortScroll, setAbortScroll] = useRecoilState(store.abortScrollFamily(index));
  const [optionSettings, setOptionSettings] = useRecoilState(store.optionSettingsFamily(index));

  return useMemo(
    () => ({
      newConversation,
      conversation,
      setConversation,
      isSubmitting,
      setIsSubmitting,
      getMessages,
      setMessages,
      setSiblingIdx,
      latestMessageId,
      latestMessageDepth,
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
      files,
      setFiles,
      filesLoading,
      setFilesLoading,
    }),
    [
      newConversation,
      conversation,
      setConversation,
      isSubmitting,
      setIsSubmitting,
      getMessages,
      setMessages,
      setSiblingIdx,
      latestMessageId,
      latestMessageDepth,
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
      files,
      setFiles,
      filesLoading,
      setFilesLoading,
    ],
  );
}
