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
import type { TResData } from '~/common';
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
    abortConversation,
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

      // Handle cancel event (triggered when stop button is clicked)
      sse.addEventListener('cancel', async () => {
        console.log('[ResumableSSE] Cancel requested, aborting job');
        sse.close();

        // Call abort endpoint to stop backend generation
        try {
          await fetch('/api/agents/chat/abort', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ streamId: currentStreamId }),
          });
        } catch (error) {
          console.error('[ResumableSSE] Error aborting job:', error);
        }

        // Handle UI cleanup via abortConversation
        const latestMessages = getMessages();
        const conversationId = latestMessages?.[latestMessages.length - 1]?.conversationId;
        try {
          await abortConversation(
            conversationId ??
              userMessage.conversationId ??
              currentSubmission.conversation?.conversationId ??
              '',
            currentSubmission as EventSubmission,
            latestMessages,
          );
        } catch (error) {
          console.error('[ResumableSSE] Error during abort:', error);
          setIsSubmitting(false);
          setShowStopButton(false);
        }
        setStreamId(null);
      });

      sse.addEventListener('error', async (e: MessageEvent) => {
        console.log('[ResumableSSE] Stream error, connection closed');
        sse.close();

        // Check for 401 and try to refresh token
        /* @ts-ignore */
        if (e.responseCode === 401) {
          try {
            const refreshResponse = await request.refreshToken();
            const newToken = refreshResponse?.token ?? '';
            if (newToken) {
              request.dispatchTokenUpdatedEvent(newToken);
              // Retry with new token
              if (submissionRef.current) {
                subscribeToStream(currentStreamId, submissionRef.current);
              }
              return;
            }
          } catch (error) {
            console.log('[ResumableSSE] Token refresh failed:', error);
          }
        }

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
      abortConversation,
      getMessages,
    ],
  );

  /**
   * Start generation (POST request that returns streamId)
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
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to start generation: ${response.statusText}`);
        }

        const { streamId: newStreamId } = await response.json();
        console.log('[ResumableSSE] Generation started:', { streamId: newStreamId });

        return newStreamId;
      } catch (error) {
        console.error('[ResumableSSE] Error starting generation:', error);
        errorHandler({ data: undefined, submission: currentSubmission as EventSubmission });
        setIsSubmitting(false);
        return null;
      }
    },
    [token, clearStepMaps, errorHandler, setIsSubmitting],
  );

  useEffect(() => {
    if (!submission || Object.keys(submission).length === 0) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setStreamId(null);
      reconnectAttemptRef.current = 0;
      submissionRef.current = null;
      return;
    }

    submissionRef.current = submission;

    const initStream = async () => {
      setIsSubmitting(true);

      const newStreamId = await startGeneration(submission);
      if (newStreamId) {
        setStreamId(newStreamId);
        subscribeToStream(newStreamId, submission);
      }
    };

    initStream();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (sseRef.current) {
        const isCancelled = sseRef.current.readyState <= 1;
        sseRef.current.close();
        if (isCancelled) {
          // Dispatch cancel event to trigger abort
          const e = new Event('cancel');
          /* @ts-ignore */
          sseRef.current.dispatchEvent(e);
        }
        sseRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  return { streamId };
}
