import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, isAssistantsEndpoint } from 'librechat-data-provider';
import { useRecoilState, useSetRecoilState, useRecoilCallback } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { ActiveJobsResponse } from '~/data-provider';
import { useLatestMessage, useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { useAbortStreamMutation } from '~/data-provider';
import { resolveAbortSteerTarget } from '~/utils';
import useNewConvo from '~/hooks/useNewConvo';
import { getMessageCacheIds } from './cache';
import { useAbortCleanup } from './abort';
import store from '~/store';

// this to be set somewhere else
export default function useChatHelpers(index = 0, paramId?: string) {
  const clearAllSubmissions = store.useClearSubmissionState();
  const [files, setFiles] = useRecoilState(store.filesByIndex(index));
  const [filesLoading, setFilesLoading] = useState(false);

  const queryClient = useQueryClient();
  /** `mutateAsync` is bound once per observer; the mutation result object is
   * fresh every render and would defeat the context value memo below. */
  const { mutateAsync: abortStream } = useAbortStreamMutation();
  const convertSteersToQueued = useSteerConvert();
  const { captureSubmission, clearSubmissionsUnlessReplaced } = useAbortCleanup(index);

  /**
   * Interrupt & send fallback: clearing submissions below can tear down the
   * SSE before its aborted-final event is processed, and only that event
   * writes the run-end signal the queue drain consumes. When the one-shot
   * interrupt flag is armed and no run-end has landed yet, write it here from
   * the abort response so the queued follow-up still auto-sends. If the SSE
   * final DOES arrive later, its signal finds the flag already consumed and
   * an `aborted` outcome drains nothing — no double fire.
   */
  const signalInterruptDrain = useRecoilCallback(
    ({ snapshot, set }) =>
      (convoId: string) => {
        const armed = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
        const runEnd = snapshot.getLoadable(store.runEndByIndex(index)).getValue();
        if (!armed || runEnd != null) {
          return;
        }
        set(store.runEndByIndex(index), {
          conversationId: convoId,
          outcome: 'aborted',
          endedAt: Date.now(),
        });
      },
    [index],
  );

  const { newConversation } = useNewConvo(index);
  const { useCreateConversationAtom } = store;
  const { conversation, setConversation } = useCreateConversationAtom(index);
  const { conversationId, endpoint, endpointType } = conversation ?? {};

  /** Use paramId (from URL) as primary source for query key - this must match what ChatView uses
  Falling back to conversationId (Recoil) only if paramId is not available */
  const queryParam = paramId === 'new' ? paramId : (paramId ?? conversationId ?? '');

  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmittingFamily(index));
  const latestMessage = useLatestMessage(index, queryParam);

  const latestMessageId = useLatestMessageId(index, queryParam) ?? undefined;
  const latestMessageDepth = latestMessage?.depth;
  const latestMessageRef = useRef(latestMessage);
  latestMessageRef.current = latestMessage;

  const setSiblingIdx = useSetRecoilState(
    store.messagesSiblingIdxFamily(latestMessage?.parentMessageId ?? null),
  );

  const setMessages = useCallback(
    (messages: TMessage[]) => {
      const messageCacheIds = getMessageCacheIds({ queryParam, conversationId, messages });
      for (const messageCacheId of messageCacheIds) {
        queryClient.setQueryData<TMessage[]>([QueryKeys.messages, messageCacheId], messages);
      }
    },
    [queryParam, queryClient, conversationId],
  );

  const getMessages = useCallback(
    (targetConversationId?: string | null) => {
      return queryClient.getQueryData<TMessage[]>([
        QueryKeys.messages,
        targetConversationId ?? queryParam,
      ]);
    },
    [queryParam, queryClient],
  );

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

      // The aborted run's final SSE can land (and the interrupt drain can
      // start the NEXT submission) while the abort response is in flight —
      // the fallback clear below must not tear down that new run.
      const submissionAtAbort = captureSubmission();
      try {
        console.log('[useChatHelpers] Calling abort mutation for:', conversationId);
        const response = await abortStream({ conversationId });
        console.log('[useChatHelpers] Abort mutation succeeded');
        // The response's `aborted` field is the RESOLVED job id — authoritative
        // when this turn still holds the `new` placeholder. Chips and the drain
        // signal land where the mounted composer's queue machinery looks, while
        // the parked-copy claim uses the resolved id the server keyed it under.
        const { chipConvoId, claimConvoId } = resolveAbortSteerTarget({
          conversationId,
          resolvedId: response?.aborted,
        });
        // Steers the run never injected ride the abort response. Consume them
        // here as well as on the SSE final event — clearing submissions below
        // can close the stream before that event lands, and conversion
        // dedupes by steer id so double delivery is a no-op. `claimParked`
        // clears the parked server copy so a reload can't re-mint the chips.
        if (Array.isArray(response?.pendingSteers)) {
          convertSteersToQueued(chipConvoId, response.pendingSteers, {
            claimParked: true,
            claimConversationId: claimConvoId,
          });
        }
        signalInterruptDrain(chipConvoId);
        // The SSE will receive a `done` event with `aborted: true` and clean up
        // We still clear submissions as a fallback
        clearSubmissionsUnlessReplaced(submissionAtAbort);
      } catch (error) {
        console.error('[useChatHelpers] Abort failed:', error);
        // An abort that 404s (run completed first) still needs the interrupt
        // fallback: without a run-end signal the queued interrupt message
        // strands and the armed flag would leak onto a later run.
        signalInterruptDrain(conversationId);
        // Fall back to clearing submissions
        clearSubmissionsUnlessReplaced(submissionAtAbort);
      }
    } else {
      // For assistants endpoints, just clear submissions (existing behavior)
      console.log('[useChatHelpers] Assistants endpoint, just clearing submissions');
      clearAllSubmissions();
    }
  }, [
    conversationId,
    endpoint,
    endpointType,
    abortStream,
    captureSubmission,
    convertSteersToQueued,
    signalInterruptDrain,
    clearSubmissionsUnlessReplaced,
    clearAllSubmissions,
    queryClient,
  ]);

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
