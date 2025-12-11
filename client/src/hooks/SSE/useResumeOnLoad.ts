import { useEffect, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { Constants, tMessageSchema } from 'librechat-data-provider';
import type { TMessage, TConversation, TSubmission, Agents } from 'librechat-data-provider';
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
  } as TSubmission;
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
  const hasResumedRef = useRef<string | null>(null);

  // Check for active stream when conversation changes
  // const { data: streamStatus, isSuccess } = useStreamStatus(
  //   conversationId,
  //   resumableEnabled && !currentSubmission, // Only check if no active submission
  // );

  useEffect(() => {
    // if (!resumableEnabled || !conversationId || !isSuccess || !streamStatus) {
    if (!resumableEnabled || !conversationId) {
      return;
    }

    // Don't resume if we already have an active submission
    if (currentSubmission) {
      return;
    }

    // Don't resume the same conversation twice
    if (hasResumedRef.current === conversationId) {
      return;
    }

    // Check if there's an active job to resume
    // if (!streamStatus.active || !streamStatus.streamId) {
    //   return;
    // }

    // console.log('[ResumeOnLoad] Found active job, creating submission...', {
    //   streamId: streamStatus.streamId,
    //   status: streamStatus.status,
    // });

    hasResumedRef.current = conversationId;

    const messages = getMessages() || [];

    // Minimal submission without resume state
    const lastMessage = messages[messages.length - 1];
    const submission: TSubmission = {
      messages,
      userMessage: lastMessage ?? ({ messageId: 'resume', conversationId, text: '' } as TMessage),
      initialResponse: {
        messageId: 'resume_',
        conversationId,
        text: '',
        content: [{ type: 'text', text: '' }],
      } as TMessage,
      conversation: { conversationId, title: 'Resumed Chat' } as TConversation,
      isRegenerate: false,
      isTemporary: false,
      endpointOption: {},
    } as TSubmission;
    setSubmission(submission);
  }, [conversationId, resumableEnabled, currentSubmission, getMessages, setSubmission]);

  // Reset hasResumedRef when conversation changes
  useEffect(() => {
    if (conversationId !== hasResumedRef.current) {
      hasResumedRef.current = null;
    }
  }, [conversationId]);
}
