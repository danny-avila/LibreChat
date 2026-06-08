import { useEffect, useState, useRef, useCallback } from 'react';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import {
  request,
  Constants,
  QueryKeys,
  ErrorTypes,
  StepEvents,
  apiBaseUrl,
  createPayload,
  ViolationTypes,
  removeNullishValues,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TPayload,
  TSubmission,
  TConversation,
  EventSubmission,
} from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { ActiveJobsResponse } from '~/data-provider';
import type { TResData } from '~/common';
import {
  clearAllDrafts,
  removeConvoFromAllQueries,
  upsertConvoInAllQueries,
  markStreamStartFailedMetadata,
} from '~/utils';
import {
  useGetUserBalance,
  useGetStartupConfig,
  queueTitleGeneration,
  streamStatusQueryKey,
} from '~/data-provider';
import useEventHandlers, { buildCreatedInitialResponse } from './useEventHandlers';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

type ChatHelpers = Pick<
  EventHandlerParams,
  'setMessages' | 'getMessages' | 'setConversation' | 'setIsSubmitting' | 'newConversation'
>;

const getStreamStartFailureData = (errorData?: Record<string, unknown>): TResData =>
  ({
    text: errorData
      ? JSON.stringify(errorData)
      : 'Error connecting to server, try refreshing the page.',
    metadata: markStreamStartFailedMetadata(),
  }) as unknown as TResData;

const MAX_RETRIES = 5;
const START_GENERATION_NETWORK_RETRIES = 3;
const START_GENERATION_READINESS_TIMEOUT_MS = 120000;
const SERVER_NOT_READY_CODE = 'SERVER_NOT_READY';

type StartGenerationError = {
  code?: string;
  response?: {
    status?: number;
    data?: {
      code?: string;
    };
    headers?: Record<string, string | number | string[] | undefined>;
  };
};

const toStartGenerationError = (error: unknown): StartGenerationError | undefined =>
  error != null && typeof error === 'object' ? (error as StartGenerationError) : undefined;

const isRetryableNetworkError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const { code } = toStartGenerationError(error) ?? {};
  return code === 'ERR_NETWORK' || code === 'ERR_INTERNET_DISCONNECTED';
};

const isServerNotReadyError = (error: unknown) => {
  const candidate = toStartGenerationError(error);
  return (
    candidate?.response?.status === 503 && candidate.response?.data?.code === SERVER_NOT_READY_CODE
  );
};

const getRetryAfterDelay = (error: unknown, fallbackDelay: number) => {
  const headers = toStartGenerationError(error)?.response?.headers;
  const rawValue = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const retryAfter = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const seconds = typeof retryAfter === 'number' ? retryAfter : Number(retryAfter);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return fallbackDelay;
  }

  return Math.min(seconds * 1000, 30000);
};

const waitForRetryDelay = (delay: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    function cleanup() {
      signal?.removeEventListener('abort', onAbort);
    }
    function onAbort() {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, delay);

    signal?.addEventListener('abort', onAbort, { once: true });
  });

const hasConcreteConversationId = (conversationId?: string | null) =>
  !!conversationId &&
  conversationId !== Constants.NEW_CONVO &&
  conversationId !== Constants.PENDING_CONVO;

const isInitialNewConversation = (submission: TSubmission) => {
  const conversationId = submission.conversation?.conversationId;
  return !hasConcreteConversationId(conversationId);
};

const getToolCallName = (toolCall: unknown) =>
  toolCall != null && typeof toolCall === 'object' && 'name' in toolCall
    ? (toolCall.name as unknown)
    : undefined;

const isOAuthToolCallName = (name: unknown) =>
  typeof name === 'string' && name.startsWith(`oauth${Constants.mcp_delimiter}`);

const hasOAuthToolCall = (toolCalls: unknown) =>
  Array.isArray(toolCalls) &&
  toolCalls.some((toolCall) => isOAuthToolCallName(getToolCallName(toolCall)));

const isOAuthStepEvent = (data: unknown) => {
  if (data == null || typeof data !== 'object' || !('event' in data)) {
    return false;
  }

  const event = data.event;
  const payload = 'data' in data ? data.data : undefined;
  if (payload == null || typeof payload !== 'object') {
    return false;
  }

  if (event === StepEvents.ON_RUN_STEP) {
    const stepDetails = 'stepDetails' in payload ? payload.stepDetails : undefined;
    return (
      stepDetails != null &&
      typeof stepDetails === 'object' &&
      'tool_calls' in stepDetails &&
      hasOAuthToolCall(stepDetails.tool_calls)
    );
  }

  if (event === StepEvents.ON_RUN_STEP_DELTA) {
    const delta = 'delta' in payload ? payload.delta : undefined;
    if (delta == null || typeof delta !== 'object') {
      return false;
    }
    return (
      ('auth' in delta && delta.auth != null) ||
      ('tool_calls' in delta && hasOAuthToolCall(delta.tool_calls))
    );
  }

  if (event === StepEvents.ON_RUN_STEP_COMPLETED) {
    const result = 'result' in payload ? payload.result : undefined;
    if (result == null || typeof result !== 'object' || !('tool_call' in result)) {
      return false;
    }
    return isOAuthToolCallName(getToolCallName(result.tool_call));
  }

  return false;
};

const replaceNewConversationUrl = (conversationId: string) => {
  if (window.location.pathname !== `/c/${Constants.NEW_CONVO}`) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    '',
    `/c/${conversationId}${window.location.search}`,
  );
};

const shouldHydrateMessage = (message: TMessage) =>
  !hasConcreteConversationId(message.conversationId);

const hydrateMessageConversationId = (message: TMessage, conversationId: string): TMessage =>
  shouldHydrateMessage(message) ? { ...message, conversationId } : message;

const getOptimisticMessages = (
  submission: TSubmission,
  conversationId: string,
  messages?: TMessage[],
): TMessage[] => {
  const sourceMessages =
    messages && messages.length > 0
      ? messages
      : [submission.userMessage, submission.initialResponse].filter(
          (message): message is TMessage => message != null,
        );

  return sourceMessages.map((message) => hydrateMessageConversationId(message, conversationId));
};

const buildOptimisticConversation = (
  submission: TSubmission,
  conversationId: string,
): TConversation => {
  const now = new Date().toISOString();
  const messageIds = [
    submission.userMessage?.messageId,
    submission.initialResponse?.messageId,
  ].filter((messageId): messageId is string => typeof messageId === 'string' && messageId !== '');

  return {
    ...submission.conversation,
    conversationId,
    endpoint: submission.conversation.endpoint ?? null,
    title: submission.conversation.title ?? 'New Chat',
    messages: messageIds.length > 0 ? messageIds : submission.conversation.messages,
    createdAt: submission.conversation.createdAt ?? now,
    updatedAt: now,
  } as TConversation;
};

const hydrateSubmissionMessages = (
  submission: TSubmission,
  conversationId: string,
): TSubmission => ({
  ...submission,
  conversation: {
    ...submission.conversation,
    conversationId,
  },
  userMessage: hydrateMessageConversationId(submission.userMessage, conversationId),
  initialResponse: submission.initialResponse
    ? hydrateMessageConversationId(submission.initialResponse, conversationId)
    : submission.initialResponse,
});

const buildResumeEventSubmission = (
  currentSubmission: TSubmission,
  currentUserMessage: TMessage,
  resumeState?: Agents.ResumeState | null,
): EventSubmission => {
  if (!resumeState) {
    return { ...currentSubmission, userMessage: currentUserMessage } as EventSubmission;
  }

  const conversationId =
    resumeState.conversationId ??
    resumeState.userMessage?.conversationId ??
    currentUserMessage.conversationId ??
    currentSubmission.conversation?.conversationId;

  const userMessage = {
    ...currentUserMessage,
    ...resumeState.userMessage,
    conversationId,
    isCreatedByUser: true,
  } as TMessage;

  const responseMessageId =
    resumeState.responseMessageId ??
    currentSubmission.initialResponse?.messageId ??
    `${userMessage.messageId}_`;

  const initialResponse = {
    ...(currentSubmission.initialResponse as TMessage),
    messageId: responseMessageId,
    parentMessageId: userMessage.messageId,
    conversationId,
    content:
      resumeState.aggregatedContent ??
      (currentSubmission.initialResponse as TMessage | undefined)?.content,
    sender: resumeState.sender ?? currentSubmission.initialResponse?.sender,
    isCreatedByUser: false,
  } as TMessage;

  return {
    ...currentSubmission,
    conversation: {
      ...currentSubmission.conversation,
      conversationId,
    },
    userMessage,
    initialResponse,
  } as EventSubmission;
};

const mergeResumeMessages = (
  messages: TMessage[],
  userMessage: TMessage,
  responseMessage: TMessage,
): TMessage[] => {
  const nextMessages = [...messages];
  const userIndex = nextMessages.findIndex(
    (message) => message.messageId === userMessage.messageId,
  );
  const responseIndex = nextMessages.findIndex(
    (message) => message.messageId === responseMessage.messageId,
  );

  if (userIndex >= 0) {
    nextMessages[userIndex] = { ...nextMessages[userIndex], ...userMessage };
  }

  if (responseIndex >= 0) {
    nextMessages[responseIndex] = { ...nextMessages[responseIndex], ...responseMessage };
  }

  if (userIndex >= 0 && responseIndex >= 0) {
    return nextMessages;
  }

  if (userIndex >= 0) {
    const insertAt = userIndex + 1;
    nextMessages.splice(insertAt, 0, responseMessage);
    return nextMessages;
  }

  if (responseIndex >= 0) {
    nextMessages.splice(responseIndex, 0, userMessage);
    return nextMessages;
  }

  return [...nextMessages, userMessage, responseMessage];
};

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
  const queryClient = useQueryClient();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));

  const { token, isAuthenticated } = useAuthContext();
  const { setMessages, getMessages, setConversation, setIsSubmitting, newConversation } =
    chatHelpers;

  /**
   * Optimistically add a job ID to the active jobs cache.
   * Called when generation starts.
   */
  const addActiveJob = useCallback(
    (jobId: string) => {
      queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
        activeJobIds: [...new Set([...(old?.activeJobIds ?? []), jobId])],
      }));
    },
    [queryClient],
  );

  /**
   * Optimistically remove a job ID from the active jobs cache.
   * Called when generation completes, aborts, or errors.
   */
  const removeActiveJob = useCallback(
    (jobId: string) => {
      queryClient.setQueryData<ActiveJobsResponse>([QueryKeys.activeJobs], (old) => ({
        activeJobIds: (old?.activeJobIds ?? []).filter((id) => id !== jobId),
      }));
    },
    [queryClient],
  );

  const addOptimisticConversation = useCallback(
    (conversationId: string, currentSubmission: TSubmission): TSubmission => {
      if (!isInitialNewConversation(currentSubmission)) {
        return currentSubmission;
      }

      const optimisticConversation = buildOptimisticConversation(currentSubmission, conversationId);
      const optimisticMessages = getOptimisticMessages(
        currentSubmission,
        conversationId,
        getMessages(),
      );

      queryClient.setQueryData<TConversation>(
        [QueryKeys.conversation, conversationId],
        (current) => current ?? optimisticConversation,
      );
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversationId],
        optimisticMessages,
      );
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, Constants.NEW_CONVO],
        optimisticMessages,
      );
      upsertConvoInAllQueries(queryClient, optimisticConversation);

      return hydrateSubmissionMessages(currentSubmission, conversationId);
    },
    [getMessages, queryClient],
  );
  const [_completed, setCompleted] = useState(new Set());
  const [streamId, setStreamId] = useState<string | null>(null);
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setSubmission = useSetRecoilState(store.submissionByIndex(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));

  const sseRef = useRef<SSE | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const submissionRef = useRef<TSubmission | null>(null);
  const optimisticStreamIdsRef = useRef(new Set<string>());
  const createdStreamIdsRef = useRef(new Set<string>());

  const {
    stepHandler,
    finalHandler,
    errorHandler,
    clearStepMaps,
    messageHandler,
    contentHandler,
    createdHandler,
    titleHandler,
    syncStepMessage,
    attachmentHandler,
    resetContentHandler,
  } = useEventHandlers({
    setMessages,
    getMessages,
    setCompleted,
    isAddedRequest,
    setConversation,
    setIsSubmitting,
    newConversation,
    setShowStopButton,
  });

  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });

  /**
   * Subscribe to stream via SSE library (supports custom headers)
   * Follows same auth pattern as useSSE
   * @param isResume - If true, adds ?resume=true to trigger sync event from server
   */
  const subscribeToStream = useCallback(
    (currentStreamId: string, currentSubmission: TSubmission, isResume = false) => {
      let { userMessage } = currentSubmission;
      let textIndex: number | null = null;
      const preCreatedStepEvents: Array<Parameters<typeof stepHandler>[0]> = [];
      const replayPreCreatedStepEvents = () => {
        if (preCreatedStepEvents.length === 0) {
          return;
        }

        const submission = { ...currentSubmission, userMessage } as EventSubmission;
        for (const event of preCreatedStepEvents.splice(0)) {
          stepHandler(event, submission);
        }
      };

      const baseUrl = `${apiBaseUrl()}/api/agents/chat/stream/${encodeURIComponent(currentStreamId)}`;
      const url = isResume ? `${baseUrl}?resume=true` : baseUrl;
      console.log('[ResumableSSE] Subscribing to stream:', url, { isResume });

      const sse = new SSE(url, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      sseRef.current = sse;

      sse.addEventListener('open', () => {
        console.log('[ResumableSSE] Stream connected');
        setAbortScroll(false);
        // Restore UI state on successful connection (including reconnection)
        setIsSubmitting(true);
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
            clearAllDrafts(currentSubmission.conversation?.conversationId);
            if (optimisticStreamIdsRef.current.has(currentStreamId)) {
              clearAllDrafts(Constants.NEW_CONVO);
            }
            try {
              finalHandler(data, currentSubmission as EventSubmission);
            } catch (error) {
              console.error('[ResumableSSE] Error in finalHandler:', error);
              setIsSubmitting(false);
              setShowStopButton(false);
            }
            // Clear handler maps on stream completion to prevent memory leaks
            clearStepMaps();
            // Optimistically remove from active jobs
            removeActiveJob(currentStreamId);
            (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
            sse.close();
            setStreamId(null);
            optimisticStreamIdsRef.current.delete(currentStreamId);
            createdStreamIdsRef.current.delete(currentStreamId);
            return;
          }

          if (data.created != null) {
            console.log('[ResumableSSE] Received CREATED event', {
              messageId: data.message?.messageId,
              conversationId: data.message?.conversationId,
            });
            createdStreamIdsRef.current.add(currentStreamId);
            const runId = v4();
            setActiveRunId(runId);
            userMessage = {
              ...userMessage,
              ...data.message,
              overrideParentMessageId: userMessage.overrideParentMessageId,
            };
            const createdInitialResponse = buildCreatedInitialResponse({
              initialResponse: currentSubmission.initialResponse as TMessage,
              userMessage,
              isRegenerate: currentSubmission.isRegenerate,
            });
            currentSubmission = {
              ...currentSubmission,
              userMessage,
              initialResponse: createdInitialResponse,
            };
            submissionRef.current = currentSubmission;
            createdHandler(data, currentSubmission as EventSubmission);
            replayPreCreatedStepEvents();
            return;
          }

          if (data.event === 'attachment' && data.data) {
            attachmentHandler({
              data: data.data,
              submission: currentSubmission as EventSubmission,
            });
            return;
          }

          if (data.event === 'title') {
            titleHandler(data);
            return;
          }

          if (data.event != null) {
            if (!isResume && !createdStreamIdsRef.current.has(currentStreamId)) {
              if (isOAuthStepEvent(data)) {
                preCreatedStepEvents.push(data);
                stepHandler(data, { ...currentSubmission, userMessage } as EventSubmission);
                return;
              }
              preCreatedStepEvents.push(data);
              return;
            }
            stepHandler(data, { ...currentSubmission, userMessage } as EventSubmission);
            return;
          }

          if (data.sync != null) {
            console.log('[ResumableSSE] SYNC received', {
              runSteps: data.resumeState?.runSteps?.length ?? 0,
              pendingEvents: data.pendingEvents?.length ?? 0,
            });

            const runId = v4();
            setActiveRunId(runId);
            const resumeSubmission = buildResumeEventSubmission(
              currentSubmission,
              userMessage,
              data.resumeState,
            );
            currentSubmission = resumeSubmission;
            submissionRef.current = resumeSubmission;
            userMessage = resumeSubmission.userMessage;

            if (data.resumeState?.runSteps) {
              for (const runStep of data.resumeState.runSteps) {
                stepHandler({ event: StepEvents.ON_RUN_STEP, data: runStep }, resumeSubmission);
              }
            }

            if (data.resumeState?.aggregatedContent && userMessage?.messageId) {
              const messages = getMessages() ?? [];
              const userMsgId = userMessage.messageId;
              const serverResponseId = data.resumeState.responseMessageId;

              let responseIdx = -1;
              if (serverResponseId) {
                responseIdx = messages.findIndex((m) => m.messageId === serverResponseId);
              }
              if (responseIdx < 0) {
                responseIdx = messages.findIndex(
                  (m) =>
                    !m.isCreatedByUser &&
                    (m.messageId === `${userMsgId}_` || m.parentMessageId === userMsgId),
                );
              }

              console.log('[ResumableSSE] SYNC update', {
                userMsgId,
                serverResponseId,
                responseIdx,
                foundMessageId: responseIdx >= 0 ? messages[responseIdx]?.messageId : null,
                messagesCount: messages.length,
                aggregatedContentLength: data.resumeState.aggregatedContent?.length,
              });

              if (responseIdx >= 0) {
                const oldContent = messages[responseIdx]?.content;
                const responseMessage = {
                  ...messages[responseIdx],
                  content: data.resumeState.aggregatedContent,
                } as TMessage;
                const updated = mergeResumeMessages(messages, userMessage, responseMessage);
                console.log('[ResumableSSE] SYNC updating message', {
                  messageId: responseMessage.messageId,
                  oldContentLength: Array.isArray(oldContent) ? oldContent.length : 0,
                  newContentLength: data.resumeState.aggregatedContent?.length,
                });
                setMessages(updated);
                resetContentHandler();
                syncStepMessage(responseMessage);
                console.log('[ResumableSSE] SYNC complete, handlers synced');
              } else {
                const responseId = serverResponseId ?? `${userMsgId}_`;
                const newMessage = {
                  messageId: responseId,
                  parentMessageId: userMsgId,
                  conversationId: currentSubmission.conversation?.conversationId ?? '',
                  text: '',
                  content: data.resumeState.aggregatedContent,
                  isCreatedByUser: false,
                } as TMessage;
                setMessages(mergeResumeMessages(messages, userMessage, newMessage));
                resetContentHandler();
                syncStepMessage(newMessage);
              }
            }

            if (data.resumeState?.titleEvent) {
              titleHandler(data.resumeState.titleEvent);
            }

            if (data.resumeState?.replayEvents?.length > 0) {
              console.log(
                `[ResumableSSE] Replaying ${data.resumeState.replayEvents.length} resume events`,
              );
              for (const replayEvent of data.resumeState.replayEvents) {
                if (replayEvent.event != null) {
                  stepHandler(replayEvent, resumeSubmission);
                }
              }
            }

            if (data.pendingEvents?.length > 0) {
              console.log(`[ResumableSSE] Replaying ${data.pendingEvents.length} pending events`);
              for (const pendingEvent of data.pendingEvents) {
                if (pendingEvent.event === 'title') {
                  titleHandler(pendingEvent);
                } else if (pendingEvent.event != null) {
                  stepHandler(pendingEvent, resumeSubmission);
                } else if (pendingEvent.type != null) {
                  contentHandler({ data: pendingEvent, submission: resumeSubmission });
                }
              }
            }

            setIsSubmitting(true);
            setShowStopButton(true);
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

      /**
       * Error event handler - handles BOTH:
       * 1. HTTP-level errors (responseCode present) - 404, 401, network failures
       * 2. Server-sent error events (event: error with data) - known errors like ViolationTypes/ErrorTypes
       *
       * Order matters: check responseCode first since HTTP errors may also include data
       */
      sse.addEventListener('error', async (e: MessageEvent) => {
        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();

        /* @ts-ignore - sse.js types don't expose responseCode */
        const responseCode = e.responseCode;

        // 404 → job completed & was cleaned up; messages are persisted in DB.
        // Invalidate cache once so react-query refetches instead of showing an error.
        if (responseCode === 404) {
          const convoId = currentSubmission.conversation?.conversationId;
          console.log('[ResumableSSE] Stream 404, invalidating messages for:', convoId);
          sse.close();
          removeActiveJob(currentStreamId);
          clearAllDrafts(convoId);
          if (optimisticStreamIdsRef.current.has(currentStreamId)) {
            clearAllDrafts(Constants.NEW_CONVO);
          }
          clearStepMaps();
          if (convoId) {
            queryClient.invalidateQueries({ queryKey: [QueryKeys.messages, convoId] });
            queryClient.removeQueries({ queryKey: streamStatusQueryKey(convoId) });
          }
          if (
            !createdStreamIdsRef.current.has(currentStreamId) &&
            optimisticStreamIdsRef.current.has(currentStreamId)
          ) {
            removeConvoFromAllQueries(queryClient, currentStreamId);
          }
          setIsSubmitting(false);
          setShowStopButton(false);
          setStreamId(null);
          optimisticStreamIdsRef.current.delete(currentStreamId);
          createdStreamIdsRef.current.delete(currentStreamId);
          reconnectAttemptRef.current = 0;
          return;
        }

        // Check for 401 and try to refresh token (same pattern as useSSE)
        if (responseCode === 401) {
          try {
            const refreshResponse = await request.refreshToken();
            const newToken = refreshResponse?.token ?? '';
            if (!newToken) {
              throw new Error('Token refresh failed.');
            }
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

        /**
         * Server-sent error event (event: error with data) - no responseCode.
         * These are known errors (ErrorTypes, ViolationTypes) that should be displayed to user.
         * Only check e.data if there's no HTTP responseCode, since HTTP errors may also have body data.
         * Note: responseCode === 0 means transport failure (connection dropped) - treat as network error,
         * not a server-sent error payload. Use `== null` to only match undefined/null (no HTTP status).
         */
        if (responseCode == null && e.data) {
          console.log('[ResumableSSE] Server-sent error event received:', e.data);
          sse.close();
          removeActiveJob(currentStreamId);
          if (
            !createdStreamIdsRef.current.has(currentStreamId) &&
            optimisticStreamIdsRef.current.has(currentStreamId)
          ) {
            removeConvoFromAllQueries(queryClient, currentStreamId);
          }

          try {
            const errorData = JSON.parse(e.data);
            const errorString = errorData.error ?? errorData.message ?? JSON.stringify(errorData);

            // Check if it's a known error type (ViolationTypes or ErrorTypes)
            let isKnownError = false;
            try {
              const parsed =
                typeof errorString === 'string' ? JSON.parse(errorString) : errorString;
              const errorType = parsed?.type ?? parsed?.code;
              if (errorType) {
                const violationValues = Object.values(ViolationTypes) as string[];
                const errorTypeValues = Object.values(ErrorTypes) as string[];
                isKnownError =
                  violationValues.includes(errorType) || errorTypeValues.includes(errorType);
              }
            } catch {
              // Not JSON or parsing failed - treat as generic error
            }

            console.log('[ResumableSSE] Error type check:', { isKnownError, errorString });

            // Display the error to user via errorHandler
            errorHandler({
              data: { text: errorString } as unknown as Parameters<typeof errorHandler>[0]['data'],
              submission: currentSubmission as EventSubmission,
            });
          } catch (parseError) {
            console.error('[ResumableSSE] Failed to parse server error:', parseError);
            errorHandler({
              data: { text: e.data } as unknown as Parameters<typeof errorHandler>[0]['data'],
              submission: currentSubmission as EventSubmission,
            });
          }

          setIsSubmitting(false);
          setShowStopButton(false);
          setStreamId(null);
          optimisticStreamIdsRef.current.delete(currentStreamId);
          createdStreamIdsRef.current.delete(currentStreamId);
          reconnectAttemptRef.current = 0;
          return;
        }

        // Network failure or unknown HTTP error - attempt reconnection with backoff
        console.log('[ResumableSSE] Stream error (network failure) - will attempt reconnect', {
          responseCode,
          hasData: !!e.data,
        });

        if (reconnectAttemptRef.current < MAX_RETRIES) {
          // Increment counter BEFORE close() so abort handler knows we're reconnecting
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);

          console.log(
            `[ResumableSSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RETRIES})`,
          );

          sse.close();

          reconnectTimeoutRef.current = setTimeout(() => {
            if (submissionRef.current) {
              // Reconnect with isResume=true to get sync event with any missed content
              subscribeToStream(currentStreamId, submissionRef.current, true);
            }
          }, delay);

          // Keep UI in "submitting" state during reconnection attempts
          // so user knows we're still trying (abort handler may have reset these)
          setIsSubmitting(true);
          setShowStopButton(true);
        } else {
          console.error('[ResumableSSE] Max reconnect attempts reached');
          sse.close();
          errorHandler({ data: undefined, submission: currentSubmission as EventSubmission });
          // Optimistically remove from active jobs on max retries
          removeActiveJob(currentStreamId);
          if (
            !createdStreamIdsRef.current.has(currentStreamId) &&
            optimisticStreamIdsRef.current.has(currentStreamId)
          ) {
            removeConvoFromAllQueries(queryClient, currentStreamId);
          }
          setIsSubmitting(false);
          setShowStopButton(false);
          setStreamId(null);
          optimisticStreamIdsRef.current.delete(currentStreamId);
          createdStreamIdsRef.current.delete(currentStreamId);
        }
      });

      /**
       * Abort event - fired when sse.close() is called (intentional close).
       * This happens on cleanup/navigation OR when error handler closes to reconnect.
       * Only reset state if we're NOT in a reconnection cycle.
       */
      sse.addEventListener('abort', () => {
        // If we're in a reconnection cycle, don't reset state
        // (error handler will set up the reconnect timeout)
        if (reconnectAttemptRef.current > 0) {
          console.log('[ResumableSSE] Stream closed for reconnect - preserving state');
          return;
        }

        console.log('[ResumableSSE] Stream aborted (intentional close) - no reconnect');
        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        // Reset UI state - useResumeOnLoad will restore if user returns to this conversation
        setIsSubmitting(false);
        setShowStopButton(false);
        setStreamId(null);
      });

      // Start the SSE connection
      sse.stream();

      // Debug hooks for testing reconnection vs clean close behavior (dev only)
      if (import.meta.env.DEV) {
        const debugWindow = window as Window & {
          __sse?: SSE;
          __killNetwork?: () => void;
          __closeClean?: () => void;
        };
        debugWindow.__sse = sse;

        /** Simulate network drop - triggers error event → reconnection */
        debugWindow.__killNetwork = () => {
          console.log('[Debug] Simulating network drop...');
          // @ts-ignore - sse.js types are incorrect, dispatchEvent actually takes Event
          sse.dispatchEvent(new Event('error'));
        };

        /** Simulate clean close (navigation away) - triggers abort event → no reconnection */
        debugWindow.__closeClean = () => {
          console.log('[Debug] Simulating clean close (navigation away)...');
          sse.close();
        };
      }
    },
    [
      token,
      setAbortScroll,
      setActiveRunId,
      setShowStopButton,
      finalHandler,
      createdHandler,
      attachmentHandler,
      titleHandler,
      stepHandler,
      contentHandler,
      resetContentHandler,
      syncStepMessage,
      clearStepMaps,
      messageHandler,
      errorHandler,
      setIsSubmitting,
      getMessages,
      setMessages,
      startupConfig?.balance?.enabled,
      balanceQuery,
      removeActiveJob,
      queryClient,
    ],
  );

  /**
   * Start generation (POST request that returns streamId)
   * Uses request.post which has axios interceptors for automatic token refresh.
   * Retries transient network failures and startup readiness responses.
   * Readiness retries honor Retry-After until cleanup or the readiness window expires.
   */
  const startGeneration = useCallback(
    async (currentSubmission: TSubmission, signal?: AbortSignal): Promise<string | null> => {
      const payloadData = createPayload(currentSubmission);
      let { payload } = payloadData;
      payload = removeNullishValues(payload) as TPayload;

      clearStepMaps();

      const url = payloadData.server;

      let lastError: unknown = null;
      let requestAttempts = 0;
      let networkAttempts = 0;
      let readinessAttempts = 0;
      const readinessDeadline = Date.now() + START_GENERATION_READINESS_TIMEOUT_MS;

      while (!signal?.aborted) {
        requestAttempts += 1;
        try {
          // Use request.post which handles auth token refresh via axios interceptors
          const data = (await request.post(url, payload)) as { streamId: string };
          if (signal?.aborted) {
            return null;
          }
          console.log('[ResumableSSE] Generation started:', { streamId: data.streamId });
          return data.streamId;
        } catch (error) {
          if (signal?.aborted) {
            return null;
          }

          lastError = error;
          const isNetworkError = isRetryableNetworkError(error);
          const isServerNotReady = isServerNotReadyError(error);
          const remainingReadinessMs = readinessDeadline - Date.now();
          const shouldRetryNetwork =
            isNetworkError && networkAttempts < START_GENERATION_NETWORK_RETRIES - 1;
          const shouldRetryServerNotReady = isServerNotReady && remainingReadinessMs > 0;

          if (shouldRetryNetwork || shouldRetryServerNotReady) {
            networkAttempts += isNetworkError ? 1 : 0;
            readinessAttempts += isServerNotReady ? 1 : 0;
            const fallbackDelay = Math.min(1000 * Math.pow(2, requestAttempts - 1), 8000);
            const retryDelay = isServerNotReady
              ? Math.min(getRetryAfterDelay(error, fallbackDelay), remainingReadinessMs)
              : fallbackDelay;
            const reason = isServerNotReady ? 'Server not ready' : 'Network error';
            const attempt = isServerNotReady ? readinessAttempts : networkAttempts;
            const limit = isServerNotReady
              ? `${Math.ceil(START_GENERATION_READINESS_TIMEOUT_MS / 1000)}s readiness window`
              : `${START_GENERATION_NETWORK_RETRIES}`;
            console.log(
              `[ResumableSSE] ${reason} starting generation, retrying in ${retryDelay}ms (attempt ${attempt}/${limit})`,
            );
            const shouldContinue = await waitForRetryDelay(retryDelay, signal);
            if (!shouldContinue) {
              return null;
            }
            continue;
          }

          // Don't retry: either not a network error or max retries reached
          break;
        }
      }

      if (signal?.aborted) {
        return null;
      }

      console.error('[ResumableSSE] Error starting generation:', lastError);

      const axiosError = lastError as { response?: { data?: Record<string, unknown> } };
      const errorData = axiosError?.response?.data;
      errorHandler({
        data: getStreamStartFailureData(errorData),
        submission: currentSubmission as EventSubmission,
      });
      setShowStopButton(false);
      setIsSubmitting(false);
      setSubmission(null);
      return null;
    },
    [clearStepMaps, errorHandler, setIsSubmitting, setShowStopButton, setSubmission],
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
    const startController = new AbortController();
    const { signal } = startController;

    const initStream = async () => {
      if (signal.aborted) {
        return;
      }

      setIsSubmitting(true);
      setShowStopButton(true);

      if (resumeStreamId) {
        if (signal.aborted) {
          return;
        }
        // Resume: just subscribe to existing stream, don't start new generation
        console.log('[ResumableSSE] Resuming existing stream:', resumeStreamId);
        setStreamId(resumeStreamId);
        // Optimistically add to active jobs (in case it's not already there)
        addActiveJob(resumeStreamId);
        subscribeToStream(resumeStreamId, submission, true); // isResume=true
      } else {
        // New generation: start and then subscribe
        console.log('[ResumableSSE] Starting NEW generation');
        const newStreamId = await startGeneration(submission, signal);
        if (signal.aborted) {
          return;
        }
        if (newStreamId) {
          setStreamId(newStreamId);
          // Optimistically add to active jobs
          addActiveJob(newStreamId);
          // Queue title generation if this is a new conversation (first message).
          // Skip temporary conversations — the server never generates titles for
          // them, so polling would 404 indefinitely.
          const isNewConvo = isInitialNewConversation(submission);
          if (isNewConvo && !submission.isTemporary) {
            queueTitleGeneration(newStreamId);
          }
          if (isInitialNewConversation(submission)) {
            optimisticStreamIdsRef.current.add(newStreamId);
            replaceNewConversationUrl(newStreamId);
          }
          const streamSubmission = addOptimisticConversation(newStreamId, submission);
          submissionRef.current = streamSubmission;
          subscribeToStream(newStreamId, streamSubmission);
        } else {
          console.error('[ResumableSSE] Failed to get streamId from startGeneration');
        }
      }
    };

    initStream();

    return () => {
      console.log('[ResumableSSE] Cleanup - closing SSE, resetting UI state');
      startController.abort();
      // Cleanup on unmount/navigation - close connection but DO NOT abort backend
      // Reset UI state so it doesn't leak to other conversations
      // If user returns to this conversation, useResumeOnLoad will restore the state
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Reset reconnect counter before closing (so abort handler doesn't think we're reconnecting)
      reconnectAttemptRef.current = 0;
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      // Clear handler maps to prevent memory leaks and stale state
      clearStepMaps();
      // Reset UI state on cleanup - useResumeOnLoad will restore if needed
      setIsSubmitting(false);
      setShowStopButton(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  return { streamId };
}
