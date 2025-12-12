import { useEffect, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { Constants, tMessageSchema } from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission, Agents } from 'librechat-data-provider';
import { useStreamStatus } from '~/data-provider';
import store from '~/store';

/**
 * Build a submission object from resume state for reconnected streams.
 * This provides the minimum data needed for useResumableSSE to subscribe.
 */
function buildSubmissionFromResumeState(
  resumeState: Agents.ResumeState,
  streamId: string,
  messages: TMessage[],
  conversationId: string,
): TSubmission {
  const userMessageData = resumeState.userMessage;
  const responseMessageId =
    resumeState.responseMessageId ?? `${userMessageData?.messageId ?? 'resume'}_`;

  // Try to find existing user message in the messages array (from database)
  const existingUserMessage = messages.find(
    (m) => m.isCreatedByUser && m.messageId === userMessageData?.messageId,
  );

  // Try to find existing response message in the messages array (from database)
  const existingResponseMessage = messages.find(
    (m) =>
      !m.isCreatedByUser &&
      (m.messageId === responseMessageId || m.parentMessageId === userMessageData?.messageId),
  );

  // Create or use existing user message
  const userMessage: TMessage =
    existingUserMessage ??
    (userMessageData
      ? (tMessageSchema.parse({
          messageId: userMessageData.messageId,
          parentMessageId: userMessageData.parentMessageId ?? Constants.NO_PARENT,
          conversationId: userMessageData.conversationId ?? conversationId,
          text: userMessageData.text ?? '',
          isCreatedByUser: true,
          role: 'user',
        }) as TMessage)
      : (messages[messages.length - 2] ??
        ({
          messageId: 'resume_user_msg',
          conversationId,
          text: '',
          isCreatedByUser: true,
        } as TMessage)));

  // Use existing response from DB if available (preserves already-saved content)
  const initialResponse: TMessage =
    existingResponseMessage ??
    ({
      messageId: responseMessageId,
      parentMessageId: userMessage.messageId,
      conversationId,
      text: '',
      content: (resumeState.aggregatedContent as TMessage['content']) ?? [],
      isCreatedByUser: false,
      role: 'assistant',
    } as TMessage);

  const conversation: TConversation = {
    conversationId,
    title: 'Resumed Chat',
    endpoint: null,
  } as TConversation;

  return {
    messages,
    userMessage,
    initialResponse,
    conversation,
    isRegenerate: false,
    isTemporary: false,
    endpointOption: {},
    // Signal to useResumableSSE to subscribe to existing stream instead of starting new
    resumeStreamId: streamId,
  } as TSubmission & { resumeStreamId: string };
}

/**
 * Hook to resume streaming if navigating to a conversation with active generation.
 * Checks stream status via React Query and sets submission if active job found.
 *
 * This hook:
 * 1. Uses useStreamStatus to check for active jobs on navigation
 * 2. If active job found, builds a submission with streamId and sets it
 * 3. useResumableSSE picks up the submission and subscribes to the stream
 */
export default function useResumeOnLoad(
  conversationId: string | undefined,
  getMessages: () => TMessage[] | undefined,
  runIndex = 0,
) {
  const resumableEnabled = useRecoilValue(store.resumableStreams);
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const currentSubmission = useRecoilValue(store.submissionByIndex(runIndex));
  // Track conversations we've already processed (either resumed or skipped)
  const processedConvoRef = useRef<string | null>(null);

  // Check for active stream when conversation changes
  // Only check if resumable is enabled and no active submission
  const shouldCheck =
    resumableEnabled &&
    !currentSubmission &&
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    processedConvoRef.current !== conversationId; // Don't re-check processed convos

  const { data: streamStatus, isSuccess } = useStreamStatus(conversationId, shouldCheck);

  useEffect(() => {
    console.log('[ResumeOnLoad] Effect check', {
      resumableEnabled,
      conversationId,
      hasCurrentSubmission: !!currentSubmission,
      currentSubmissionConvoId: currentSubmission?.conversation?.conversationId,
      isSuccess,
      streamStatusActive: streamStatus?.active,
      streamStatusStreamId: streamStatus?.streamId,
      processedConvoRef: processedConvoRef.current,
    });

    if (!resumableEnabled || !conversationId || conversationId === Constants.NEW_CONVO) {
      console.log('[ResumeOnLoad] Skipping - not enabled or new convo');
      return;
    }

    // Don't resume if we already have an active submission (we started it ourselves)
    if (currentSubmission) {
      console.log('[ResumeOnLoad] Skipping - already have active submission, marking as processed');
      // Mark as processed so we don't try again
      processedConvoRef.current = conversationId;
      return;
    }

    // Wait for stream status query to complete
    if (!isSuccess || !streamStatus) {
      console.log('[ResumeOnLoad] Waiting for stream status query');
      return;
    }

    // Don't process the same conversation twice
    if (processedConvoRef.current === conversationId) {
      console.log('[ResumeOnLoad] Skipping - already processed this conversation');
      return;
    }

    // Mark as processed immediately to prevent race conditions
    processedConvoRef.current = conversationId;

    // Check if there's an active job to resume
    if (!streamStatus.active || !streamStatus.streamId) {
      console.log('[ResumeOnLoad] No active job to resume for:', conversationId);
      return;
    }

    console.log('[ResumeOnLoad] Found active job, creating submission...', {
      streamId: streamStatus.streamId,
      status: streamStatus.status,
      resumeState: streamStatus.resumeState,
    });

    const messages = getMessages() || [];

    // Build submission from resume state if available
    if (streamStatus.resumeState) {
      const submission = buildSubmissionFromResumeState(
        streamStatus.resumeState,
        streamStatus.streamId,
        messages,
        conversationId,
      );
      setSubmission(submission);
    } else {
      // Minimal submission without resume state
      const lastUserMessage = [...messages].reverse().find((m) => m.isCreatedByUser);
      const submission = {
        messages,
        userMessage:
          lastUserMessage ?? ({ messageId: 'resume', conversationId, text: '' } as TMessage),
        initialResponse: {
          messageId: 'resume_',
          conversationId,
          text: '',
          content: streamStatus.aggregatedContent ?? [{ type: 'text', text: '' }],
        } as TMessage,
        conversation: { conversationId, title: 'Resumed Chat' } as TConversation,
        isRegenerate: false,
        isTemporary: false,
        endpointOption: {},
        // Signal to useResumableSSE to subscribe to existing stream instead of starting new
        resumeStreamId: streamStatus.streamId,
      } as TSubmission & { resumeStreamId: string };
      setSubmission(submission);
    }
  }, [
    conversationId,
    resumableEnabled,
    currentSubmission,
    isSuccess,
    streamStatus,
    getMessages,
    setSubmission,
  ]);

  // Reset processedConvoRef when conversation changes to a different one
  useEffect(() => {
    if (conversationId && conversationId !== processedConvoRef.current) {
      // Only reset if we're navigating to a DIFFERENT conversation
      // This allows re-checking when navigating back
      processedConvoRef.current = null;
    }
  }, [conversationId]);
}
