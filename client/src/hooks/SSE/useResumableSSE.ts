import { useEffect, useState, useRef, useCallback } from 'react';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import {
  request,
  Constants,
  createPayload,
  LocalStorageKeys,
  removeNullishValues,
} from 'librechat-data-provider';
import type { TMessage, TPayload, TSubmission, EventSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import { useGenTitleMutation, useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import useEventHandlers from './useEventHandlers';
import store from '~/store';

const clearDraft = (conversationId?: string | null) => {
  if (conversationId) {
    localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${conversationId}`);
    localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${conversationId}`);
  } else {
    localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${Constants.NEW_CONVO}`);
    localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${Constants.NEW_CONVO}`);
  }
};

type ChatHelpers = Pick<
  EventHandlerParams,
  | 'setMessages'
  | 'getMessages'
  | 'setConversation'
  | 'setIsSubmitting'
  | 'newConversation'
  | 'resetLatestMessage'
>;

const MAX_RETRIES = 5;

/**
 * Hook for resumable SSE streams.
 * Separates generation start (POST) from stream subscription (GET EventSource).
 * Supports auto-reconnection with exponential backoff.
 *
 * Key behavior:
 * - Navigation away does NOT abort the generation (just closes SSE)
 * - Only explicit abort (via stop button → backend abort endpoint) stops generation
 * - Backend emits `done` event with `aborted: true` on abort, handled via finalHandler
 */
export default function useResumableSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const genTitle = useGenTitleMutation();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));

  const { token, isAuthenticated } = useAuthContext();
  const [completed, setCompleted] = useState(new Set());
  const [streamId, setStreamId] = useState<string | null>(null);
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));

  const sseRef = useRef<SSE | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const submissionRef = useRef<TSubmission | null>(null);

  const {
    setMessages,
    getMessages,
    setConversation,
    setIsSubmitting,
    newConversation,
    resetLatestMessage,
  } = chatHelpers;

  const {
    clearStepMaps,
    stepHandler,
    syncHandler,
    finalHandler,
    errorHandler,
    messageHandler,
    contentHandler,
    createdHandler,
    attachmentHandler,
  } = useEventHandlers({
    genTitle,
    setMessages,
    getMessages,
    setCompleted,
    isAddedRequest,
    setConversation,
    setIsSubmitting,
    newConversation,
    setShowStopButton,
    resetLatestMessage,
  });

  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });

  /**
   * Subscribe to stream via SSE library (supports custom headers)
   * Follows same auth pattern as useSSE
   */
  const subscribeToStream = useCallback(
    (currentStreamId: string, currentSubmission: TSubmission) => {
      let { userMessage } = currentSubmission;
      let textIndex: number | null = null;

      const url = `/api/agents/chat/stream/${encodeURIComponent(currentStreamId)}`;
      console.log('[ResumableSSE] Subscribing to stream:', url);

      const sse = new SSE(url, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      sseRef.current = sse;

      sse.addEventListener('open', () => {
        console.log('[ResumableSSE] Stream connected');
        setAbortScroll(false);
        setShowStopButton(true);
        reconnectAttemptRef.current = 0;
      });

      sse.addEventListener('message', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);

          if (data.final != null) {
            console.log('[ResumableSSE] Received FINAL event', {
              aborted: data.aborted,
              conversationId: data.conversation?.conversationId,
              hasResponseMessage: !!data.responseMessage,
            });
            clearDraft(currentSubmission.conversation?.conversationId);
            try {
              finalHandler(data, currentSubmission as EventSubmission);
            } catch (error) {
              console.error('[ResumableSSE] Error in finalHandler:', error);
              setIsSubmitting(false);
              setShowStopButton(false);
            }
            (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
            sse.close();
            setStreamId(null);
            return;
          }

          if (data.created != null) {
            console.log('[ResumableSSE] Received CREATED event', {
              messageId: data.message?.messageId,
              conversationId: data.message?.conversationId,
            });
            const runId = v4();
            setActiveRunId(runId);
            userMessage = {
              ...userMessage,
              ...data.message,
              overrideParentMessageId: userMessage.overrideParentMessageId,
            };
            createdHandler(data, { ...currentSubmission, userMessage } as EventSubmission);
            return;
          }

          if (data.event === 'attachment' && data.data) {
            attachmentHandler({
              data: data.data,
              submission: currentSubmission as EventSubmission,
            });
            return;
          }

          if (data.event != null) {
            stepHandler(data, { ...currentSubmission, userMessage } as EventSubmission);
            return;
          }

          if (data.sync != null) {
            console.log('[ResumableSSE] Received SYNC event', {
              conversationId: data.conversationId,
              hasResumeState: !!data.resumeState,
            });
            const runId = v4();
            setActiveRunId(runId);
            syncHandler(data, { ...currentSubmission, userMessage } as EventSubmission);
            return;
          }

          if (data.type != null) {
            const { text, index } = data;
            if (text != null && index !== textIndex) {
              textIndex = index;
            }
            contentHandler({ data, submission: currentSubmission as EventSubmission });
            return;
          }

          if (data.message != null) {
            const text = data.text ?? data.response;
            const initialResponse = {
              ...(currentSubmission.initialResponse as TMessage),
              parentMessageId: data.parentMessageId,
              messageId: data.messageId,
            };
            messageHandler(text, { ...currentSubmission, userMessage, initialResponse });
          }
        } catch (error) {
          console.error('[ResumableSSE] Error processing message:', error);
        }
      });

      sse.addEventListener('error', async (e: MessageEvent) => {
        console.log('[ResumableSSE] Stream error');
        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();

        // Check for 401 and try to refresh token (same pattern as useSSE)
        /* @ts-ignore */
        if (e.responseCode === 401) {
          try {
            const refreshResponse = await request.refreshToken();
            const newToken = refreshResponse?.token ?? '';
            if (!newToken) {
              throw new Error('Token refresh failed.');
            }
            // Update headers on same SSE instance and retry (like useSSE)
            sse.headers = {
              Authorization: `Bearer ${newToken}`,
            };
            request.dispatchTokenUpdatedEvent(newToken);
            sse.stream();
            return;
          } catch (error) {
            console.log('[ResumableSSE] Token refresh failed:', error);
          }
        }

        sse.close();

        if (reconnectAttemptRef.current < MAX_RETRIES) {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);

          console.log(
            `[ResumableSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RETRIES})`,
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            if (submissionRef.current) {
              subscribeToStream(currentStreamId, submissionRef.current);
            }
          }, delay);
        } else {
          console.error('[ResumableSSE] Max reconnect attempts reached');
          errorHandler({ data: undefined, submission: currentSubmission as EventSubmission });
          setIsSubmitting(false);
          setShowStopButton(false);
          setStreamId(null);
        }
      });

      // Start the SSE connection
      sse.stream();
    },
    [
      token,
      setAbortScroll,
      setActiveRunId,
      setShowStopButton,
      finalHandler,
      createdHandler,
      attachmentHandler,
      stepHandler,
      syncHandler,
      contentHandler,
      messageHandler,
      errorHandler,
      setIsSubmitting,
      startupConfig?.balance?.enabled,
      balanceQuery,
    ],
  );

  /**
   * Start generation (POST request that returns streamId)
   * Uses request.post which has axios interceptors for automatic token refresh
   */
  const startGeneration = useCallback(
    async (currentSubmission: TSubmission): Promise<string | null> => {
      const payloadData = createPayload(currentSubmission);
      let { payload } = payloadData;
      payload = removeNullishValues(payload) as TPayload;

      clearStepMaps();

      const url = payloadData.server.includes('?')
        ? `${payloadData.server}&resumable=true`
        : `${payloadData.server}?resumable=true`;

      try {
        // Use request.post which handles auth token refresh via axios interceptors
        const data = (await request.post(url, payload)) as { streamId: string };
        console.log('[ResumableSSE] Generation started:', { streamId: data.streamId });
        return data.streamId;
      } catch (error) {
        console.error('[ResumableSSE] Error starting generation:', error);
        errorHandler({ data: undefined, submission: currentSubmission as EventSubmission });
        setIsSubmitting(false);
        return null;
      }
    },
    [clearStepMaps, errorHandler, setIsSubmitting],
  );

  useEffect(() => {
    if (!submission || Object.keys(submission).length === 0) {
      console.log('[ResumableSSE] No submission, cleaning up');
      // Clear reconnect timeout if submission is cleared
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Close SSE but do NOT dispatch cancel - navigation should not abort
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setStreamId(null);
      reconnectAttemptRef.current = 0;
      submissionRef.current = null;
      return;
    }

    const resumeStreamId = (submission as TSubmission & { resumeStreamId?: string }).resumeStreamId;
    console.log('[ResumableSSE] Effect triggered', {
      conversationId: submission.conversation?.conversationId,
      hasResumeStreamId: !!resumeStreamId,
      resumeStreamId,
      userMessageId: submission.userMessage?.messageId,
    });

    submissionRef.current = submission;

    const initStream = async () => {
      setIsSubmitting(true);
      setShowStopButton(true);

      if (resumeStreamId) {
        // Resume: just subscribe to existing stream, don't start new generation
        console.log('[ResumableSSE] Resuming existing stream:', resumeStreamId);
        setStreamId(resumeStreamId);
        subscribeToStream(resumeStreamId, submission);
      } else {
        // New generation: start and then subscribe
        console.log('[ResumableSSE] Starting NEW generation');
        const newStreamId = await startGeneration(submission);
        if (newStreamId) {
          setStreamId(newStreamId);
          subscribeToStream(newStreamId, submission);
        } else {
          console.error('[ResumableSSE] Failed to get streamId from startGeneration');
        }
      }
    };

    initStream();

    return () => {
      console.log('[ResumableSSE] Cleanup - closing SSE, resetting UI state');
      // Cleanup on unmount/navigation - close connection but DO NOT abort backend
      // Reset UI state so it doesn't leak to other conversations
      // If user returns to this conversation, useResumeOnLoad will restore the state
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      // Reset UI state on cleanup - useResumeOnLoad will restore if needed
      setIsSubmitting(false);
      setShowStopButton(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  return { streamId };
}
