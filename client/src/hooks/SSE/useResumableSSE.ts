import { useEffect, useState, useRef, useCallback } from 'react';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useRecoilCallback } from 'recoil';
import {
  request,
  Constants,
  QueryKeys,
  ErrorTypes,
  StepEvents,
  apiBaseUrl,
  SteerEvents,
  UsageEvents,
  createPayload,
  ApprovalEvents,
  ViolationTypes,
  removeNullishValues,
} from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TPayload,
  TSubmission,
  TConversation,
  TPendingSteer,
  EventSubmission,
  TSteerAppliedEvent,
} from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { ActiveJobsResponse } from '~/data-provider';
import type { TResData } from '~/common';
import {
  logger,
  clearAllDrafts,
  applySteerPart,
  applyPendingAction,
  carriedSteerContext,
  resolveRunEndTarget,
  findSteerMessageIndex,
  appendAppliedSteerIds,
  removeConvoFromAllQueries,
  upsertConvoInAllQueries,
  countTaggedApprovalParts,
  countTrailingOutputChars,
  markStreamStartFailedMetadata,
  findPendingActionMessageIndex,
} from '~/utils';
import {
  useGetUserBalance,
  fetchStreamStatus,
  useGetStartupConfig,
  queueTitleGeneration,
  streamStatusQueryKey,
} from '~/data-provider';
import useEventHandlers, { buildCreatedInitialResponse } from './useEventHandlers';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { useAuthContext } from '~/hooks/AuthContext';
import useUsageHandler from './useUsageHandler';
import store from '~/store';

type ChatHelpers = Pick<
  EventHandlerParams,
  'setMessages' | 'getMessages' | 'setConversation' | 'setIsSubmitting' | 'newConversation'
>;

const MAX_RETRIES = 5;
const START_GENERATION_NETWORK_RETRIES = 3;
const START_GENERATION_READINESS_TIMEOUT_MS = 120000;
const SERVER_NOT_READY_CODE = 'SERVER_NOT_READY';

type StartGenerationError = {
  code?: string;
  response?: {
    status?: number;
    data?: unknown;
    headers?: Record<string, string | number | string[] | undefined>;
  };
};

const toStartGenerationError = (error: unknown): StartGenerationError | undefined =>
  error != null && typeof error === 'object' ? (error as StartGenerationError) : undefined;

const getStartGenerationStreamId = (data: unknown): string | null => {
  if (data == null || typeof data !== 'object' || !('streamId' in data)) {
    return null;
  }

  const streamId = (data as { streamId?: unknown }).streamId;
  return typeof streamId === 'string' && streamId.length > 0 ? streamId : null;
};

const parseSSEErrorData = (body: string): unknown | null => {
  const blocks = body.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim();
    if (event !== 'error') {
      continue;
    }

    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n')
      .trim();

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  return null;
};

const getSSEErrorText = (payload: unknown): string | null => {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload == null || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const text = record.text ?? record.message ?? record.error;
  return typeof text === 'string' && text.length > 0 ? text : null;
};

const getStreamStartFailureText = (errorData?: unknown): string => {
  if (typeof errorData === 'string') {
    const sseErrorData = parseSSEErrorData(errorData);
    if (sseErrorData != null) {
      return getSSEErrorText(sseErrorData) ?? JSON.stringify(sseErrorData);
    }

    return errorData || 'Error connecting to server, try refreshing the page.';
  }

  return errorData
    ? JSON.stringify(errorData)
    : 'Error connecting to server, try refreshing the page.';
};

const getStreamStartFailureData = (errorData?: unknown): TResData =>
  ({
    text: getStreamStartFailureText(errorData),
    metadata: markStreamStartFailedMetadata(),
  }) as unknown as TResData;

const isRetryableNetworkError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const { code } = toStartGenerationError(error) ?? {};
  return code === 'ERR_NETWORK' || code === 'ERR_INTERNET_DISCONNECTED';
};

const isServerNotReadyError = (error: unknown) => {
  const candidate = toStartGenerationError(error);
  const data = candidate?.response?.data;
  const code =
    data != null && typeof data === 'object' && 'code' in data
      ? (data as { code?: unknown }).code
      : undefined;
  return candidate?.response?.status === 503 && code === SERVER_NOT_READY_CODE;
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

const preferDefinedString = (value?: string | null, fallback?: string): string | undefined =>
  value != null && value !== '' ? value : fallback;

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
    iconURL: preferDefinedString(currentSubmission.initialResponse?.iconURL, resumeState.iconURL),
    model: preferDefinedString(currentSubmission.initialResponse?.model, resumeState.model),
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
  /** Pending action whose tool-call content part hasn't rendered yet — retried
   *  on the next frame so a fast pause-before-render race still attaches. */
  const pendingActionRetryRef = useRef<number | null>(null);
  /** Steer event whose target response message hasn't rendered yet — same
   *  bounded next-frame retry as pending actions, on its own handle so the
   *  two retries can't cancel each other. */
  const steerRetryRef = useRef<number | null>(null);

  /** Removes the pending chip once its steer is injected (the inline content
   *  part becomes the durable record), and records the id so a 202 ACK that
   *  arrives AFTER the applied event drops its chip instead of re-minting it. */
  const resolveSteerChip = useRecoilCallback(
    ({ set }) =>
      (conversationId: string, steerId: string) => {
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          appendAppliedSteerIds(prev, [steerId]),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.some((steer) => steer.steerId === steerId)
            ? prev.filter((steer) => steer.steerId !== steerId)
            : prev,
        );
      },
    [],
  );

  /** Replaces the chip list with the server's still-queued steers (reconnect).
   *  Local `failed` entries are kept so their text stays recoverable, and a
   *  reseeded chip keeps its client-only quotes/skill picks. */
  const seedSteerChips = useRecoilCallback(
    ({ set }) =>
      (conversationId: string, steers: TPendingSteer[]) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) => {
          const chipById = new Map(prev.map((chip) => [chip.steerId, chip]));
          return [
            ...steers.map((steer) => ({
              steerId: steer.steerId,
              text: steer.text,
              status: 'pending' as const,
              createdAt: steer.createdAt ?? Date.now(),
              ...(steer.files && steer.files.length > 0 && { files: steer.files }),
              ...carriedSteerContext(chipById.get(steer.steerId)),
            })),
            ...prev.filter((steer) => steer.status === 'failed'),
          ];
        });
      },
    [],
  );

  /** Converts steers that never reached an injection boundary into queued
   *  follow-up messages (reported on the run's final/abort event; the abort
   *  HTTP response consumes the same data as a fallback in useChatHelpers). */
  const convertSteersToQueued = useSteerConvert();

  /** Error events carry no `pendingSteers` payload (the server drops its copy
   *  on failure), but every acknowledged chip's text is local — convert them
   *  to queued follow-ups so the user's words survive a failed run. `sending`
   *  chips settle through their own POST callbacks (404 falls back to
   *  queue/send) and `failed` chips keep their manual controls. */
  const convertLocalSteersToQueued = useRecoilCallback(
    ({ snapshot }) =>
      (conversationId: string, options?: { claimParked?: boolean }) => {
        const chips = snapshot.getLoadable(store.pendingSteersByConvoId(conversationId)).getValue();
        const settled = chips
          .filter((steer) => steer.status === 'pending')
          .map((steer) => ({
            steerId: steer.steerId,
            text: steer.text,
            createdAt: steer.createdAt,
            ...(steer.files && steer.files.length > 0 && { files: steer.files }),
          }));
        if (settled.length > 0) {
          convertSteersToQueued(conversationId, settled, options);
        }
      },
    [convertSteersToQueued],
  );

  const setRunEnd = useSetRecoilState(store.runEndByIndex(runIndex));

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
  const {
    contextHandler,
    usageHandler,
    tapStream,
    tapContent,
    finalizeUsage,
    backfillUsage,
    resetLive,
    seedLive,
  } = useUsageHandler();

  /**
   * Subscribe to stream via SSE library (supports custom headers)
   * Follows same auth pattern as useSSE
   * @param isResume - If true, adds ?resume=true to trigger sync event from server
   */
  const subscribeToStream = useCallback(
    (currentStreamId: string, currentSubmission: TSubmission, isResume = false) => {
      let { userMessage } = currentSubmission;
      let textIndex: number | null = null;
      let finalReceived = false;
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

      /**
       * Maps a pending action onto the in-flight response message so the
       * approval / ask-user UI renders. Syncs the result back into the step
       * handler's map so subsequent deltas build on the approval-tagged content
       * rather than clobbering it.
       *
       * If the mapping is a no-op (the paused tool-call content part hasn't
       * rendered yet — a pause-before-render race), retry on subsequent frames
       * so the approval still attaches. `ask_user_question` always applies (it
       * appends a synthetic part), so only `tool_approval` ever retries.
       */
      // Keep retrying across frames (not just once): Recoil/React message updates from
      // the preceding created/step events are async and can take several frames under
      // load, so a single retry would drop a valid pause and leave the run with no
      // approval controls. Bounded so a genuinely-absent target can't spin forever.
      const PENDING_ACTION_MAX_RETRY_FRAMES = 120;
      const applyPendingActionToMessages = (pendingAction: Agents.PendingAction, attempt = 0) => {
        const retryNextFrame = () => {
          if (attempt < PENDING_ACTION_MAX_RETRY_FRAMES) {
            pendingActionRetryRef.current = requestAnimationFrame(() =>
              applyPendingActionToMessages(pendingAction, attempt + 1),
            );
          }
        };
        const messages = getMessages() ?? [];
        const index = findPendingActionMessageIndex(messages, pendingAction);
        if (index < 0) {
          retryNextFrame();
          return;
        }
        const updated = applyPendingAction(messages[index], pendingAction);
        const changed = updated !== messages[index];
        if (changed) {
          const nextMessages = [...messages];
          nextMessages[index] = updated;
          setMessages(nextMessages);
          syncStepMessage(updated);
        }
        // A `tool_approval` pause can carry several `action_requests` whose tool-call
        // parts render on different frames; tagging only the first to arrive would leave
        // late siblings with no approval card, and the resume route then 400s the partial
        // batch ("every paused tool call must be decided"). Keep retrying (bounded) until
        // EVERY paused call is tagged. `ask_user_question` applies its single synthetic
        // part in one shot, so it only needs the original "did anything change" retry.
        if (pendingAction.payload.type === 'tool_approval') {
          const expected = pendingAction.payload.action_requests.length;
          if (countTaggedApprovalParts(updated, pendingAction.actionId) < expected) {
            retryNextFrame();
          }
        } else if (!changed) {
          retryNextFrame();
        }
      };

      /**
       * Places an injected steer part on the in-flight response message and
       * resolves its pending chip. Same bounded next-frame retry as pending
       * actions for the inject-before-render race (the assistant placeholder
       * can land a few frames after the created event under load).
       */
      const applySteerToMessages = (event: TSteerAppliedEvent, attempt = 0) => {
        const retryNextFrame = () => {
          if (attempt < PENDING_ACTION_MAX_RETRY_FRAMES) {
            steerRetryRef.current = requestAnimationFrame(() =>
              applySteerToMessages(event, attempt + 1),
            );
          }
        };
        const messages = getMessages() ?? [];
        const index = findSteerMessageIndex(messages, event);
        if (index < 0) {
          retryNextFrame();
          return;
        }
        const updated = applySteerPart(messages[index], event);
        if (updated !== messages[index]) {
          const nextMessages = [...messages];
          nextMessages[index] = updated;
          setMessages(nextMessages);
          syncStepMessage(updated);
        }
        const chipConvoId =
          event.conversationId ?? currentSubmission.conversation?.conversationId ?? currentStreamId;
        resolveSteerChip(chipConvoId, event.steerId);
      };

      const baseUrl = `${apiBaseUrl()}/api/agents/chat/stream/${encodeURIComponent(currentStreamId)}`;
      const url = isResume ? `${baseUrl}?resume=true` : baseUrl;
      logger.log('ResumableSSE', 'Subscribing to stream:', url, { isResume });

      const sse = new SSE(url, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'GET',
      });
      sseRef.current = sse;

      sse.addEventListener('open', () => {
        logger.log('ResumableSSE', 'Stream connected');
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
            finalReceived = true;
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
              reconnectTimeoutRef.current = null;
            }
            reconnectAttemptRef.current = 0;
            logger.log('ResumableSSE', 'Received FINAL event', {
              aborted: data.aborted,
              conversationId: data.conversation?.conversationId,
              hasResponseMessage: !!data.responseMessage,
            });
            clearAllDrafts(currentSubmission.conversation?.conversationId);
            if (optimisticStreamIdsRef.current.has(currentStreamId)) {
              clearAllDrafts(Constants.NEW_CONVO);
            }
            const finalConvoId =
              data.conversation?.conversationId ??
              currentSubmission.conversation?.conversationId ??
              currentStreamId;
            // Steers the run never injected ride the final event; convert them
            // to queued follow-ups before the run-end signal fires the drain
            // (also resets the applied-id set for the finished run).
            // `claimParked` clears the parked server copy of the same steers so
            // a later reload can't resurrect chips dismissed after this batch.
            convertSteersToQueued(
              finalConvoId,
              Array.isArray(data.pendingSteers) ? (data.pendingSteers as TPendingSteer[]) : [],
              { claimParked: true },
            );
            try {
              finalHandler(data, currentSubmission as EventSubmission);
              finalizeUsage(data, { ...currentSubmission, userMessage });
            } catch (error) {
              logger.error('ResumableSSE', 'Error in finalHandler:', error);
              setIsSubmitting(false);
              setShowStopButton(false);
            }
            // One-shot run-end signal for the queue drain. Written AFTER
            // finalHandler so `isSubmitting` has flipped false by the time the
            // drain effect observes it (both land in the same Recoil batch).
            // An early-aborted FIRST turn keys under NEW_CONVO: finalHandler
            // restored /c/new, so the optimistic id would strand the queue.
            const runEndTarget = resolveRunEndTarget({
              conversationId: finalConvoId,
              earlyAbort: data.earlyAbort === true,
              startedAsNewConvo: optimisticStreamIdsRef.current.has(currentStreamId),
            });
            setRunEnd({
              conversationId: runEndTarget.conversationId,
              // A Stop that lands before completion can arrive as a final with
              // `unfinished: true` and no `aborted` flag (request.js's
              // wasAbortedBeforeComplete branch) — it must not auto-drain.
              outcome:
                data.aborted === true || data.responseMessage?.unfinished === true
                  ? 'aborted'
                  : 'completed',
              startedAsNewConvo: runEndTarget.startedAsNewConvo,
              endedAt: Date.now(),
            });
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
            logger.log('ResumableSSE', 'Received CREATED event', {
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

          if (data.event === UsageEvents.ON_CONTEXT_USAGE) {
            contextHandler(data.data, { ...currentSubmission, userMessage });
            return;
          }

          if (data.event === UsageEvents.ON_TOKEN_USAGE) {
            usageHandler(data.data, { ...currentSubmission, userMessage });
            return;
          }

          if (data.event === ApprovalEvents.ON_PENDING_ACTION) {
            applyPendingActionToMessages(data.data as Agents.PendingAction);
            setIsSubmitting(true);
            return;
          }

          if (data.event === SteerEvents.ON_STEER_APPLIED) {
            applySteerToMessages(data.data as TSteerAppliedEvent);
            return;
          }

          if (data.event != null) {
            if (
              data.event === StepEvents.ON_MESSAGE_DELTA ||
              data.event === StepEvents.ON_REASONING_DELTA
            ) {
              tapStream(data.data, { ...currentSubmission, userMessage });
            }
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
            logger.log('ResumableSSE', 'SYNC received', {
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
            /**
             * Totals rebuild from the persisted backfill at sync. Replayed or
             * gap usage events already represented in the snapshot are skipped
             * via multiset matching; events that raced past the snapshot read
             * still fold so multi-call runs don't undercount.
             */
            /** Fold the run's persisted usage; events also replayed below are
             *  deduped by (runId, seq) inside the handler, so prior prompts in
             *  this conversation keep their usage and gap events still count */
            backfillUsage(data.resumeState?.collectedUsage ?? [], resumeSubmission);
            if (data.resumeState?.contextUsage) {
              /** Already reconciled to the call's real prompt tokens server-side
               *  (GenerationJobManager.persistTokenUsage) when the snapshot's call
               *  completed, so install it as-is — no client backfill reconcile. */
              contextHandler(data.resumeState.contextUsage, resumeSubmission);
            }
            /** Output streamed before this resume is not re-delivered as deltas
             *  — estimate it from the trailing aggregated content. This is
             *  needed even with a snapshot: the snapshot is pre-invoke, so the
             *  in-flight output it precedes rides on the live estimate.
             *  countTrailingOutputChars only counts output at the very end (0
             *  when paused at a tool call), so a snapshot's budget is never
             *  double-counted. */
            seedLive(
              countTrailingOutputChars(data.resumeState?.aggregatedContent),
              resumeSubmission,
            );

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

              logger.log('ResumableSSE', 'SYNC update', {
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
                  iconURL: preferDefinedString(
                    messages[responseIdx]?.iconURL,
                    data.resumeState.iconURL,
                  ),
                  model: preferDefinedString(messages[responseIdx]?.model, data.resumeState.model),
                } as TMessage;
                const updated = mergeResumeMessages(messages, userMessage, responseMessage);
                logger.log('ResumableSSE', 'SYNC updating message', {
                  messageId: responseMessage.messageId,
                  oldContentLength: Array.isArray(oldContent) ? oldContent.length : 0,
                  newContentLength: data.resumeState.aggregatedContent?.length,
                });
                setMessages(updated);
                resetContentHandler();
                syncStepMessage(responseMessage);
                logger.log('ResumableSSE', 'SYNC complete, handlers synced');
              } else {
                const responseId = serverResponseId ?? `${userMsgId}_`;
                const newMessage = {
                  messageId: responseId,
                  parentMessageId: userMsgId,
                  conversationId: currentSubmission.conversation?.conversationId ?? '',
                  text: '',
                  content: data.resumeState.aggregatedContent,
                  isCreatedByUser: false,
                  iconURL: data.resumeState.iconURL,
                  model: data.resumeState.model,
                } as TMessage;
                setMessages(mergeResumeMessages(messages, userMessage, newMessage));
                resetContentHandler();
                syncStepMessage(newMessage);
              }
            }

            /**
             * Re-pause on reconnect: the run is parked on a human-review
             * interrupt. Re-apply the pending action so the approval / ask-user
             * controls render after a reload or dropped connection.
             */
            if (data.resumeState?.pendingAction) {
              applyPendingActionToMessages(data.resumeState.pendingAction as Agents.PendingAction);
            }

            /**
             * Re-seed steer chips from the server's still-queued steers.
             * Injected steers are already inside `aggregatedContent`, so this
             * covers exactly the remainder a reloading client can't know about.
             */
            // Always reconcile against the server's still-queued list: a steer
            // applied while this client was disconnected is absent here (its
            // inline part rides aggregatedContent instead), so an EMPTY list
            // must clear stale local pending chips, not leave them stranded.
            seedSteerChips(
              currentSubmission.conversation?.conversationId ?? currentStreamId,
              (data.resumeState?.pendingSteers ?? []) as TPendingSteer[],
            );

            if (data.resumeState?.titleEvent) {
              titleHandler(data.resumeState.titleEvent);
            }

            if (data.resumeState?.replayEvents?.length > 0) {
              logger.log(
                'ResumableSSE',
                `Replaying ${data.resumeState.replayEvents.length} resume events`,
              );
              for (const replayEvent of data.resumeState.replayEvents) {
                if (replayEvent.event === UsageEvents.ON_CONTEXT_USAGE) {
                  contextHandler(replayEvent.data, resumeSubmission);
                } else if (replayEvent.event === UsageEvents.ON_TOKEN_USAGE) {
                  usageHandler(replayEvent.data, resumeSubmission);
                } else if (replayEvent.event === ApprovalEvents.ON_PENDING_ACTION) {
                  // A pause that landed after the resume snapshot must still render its
                  // controls (mirror the live handler), not fall through to stepHandler.
                  applyPendingActionToMessages(replayEvent.data as Agents.PendingAction);
                } else if (replayEvent.event === SteerEvents.ON_STEER_APPLIED) {
                  applySteerToMessages(replayEvent.data as TSteerAppliedEvent);
                } else if (replayEvent.event != null) {
                  if (
                    replayEvent.event === StepEvents.ON_MESSAGE_DELTA ||
                    replayEvent.event === StepEvents.ON_REASONING_DELTA
                  ) {
                    tapStream(replayEvent.data, resumeSubmission);
                  }
                  stepHandler(replayEvent, resumeSubmission);
                }
              }
            }

            if (data.pendingEvents?.length > 0) {
              logger.log('ResumableSSE', `Replaying ${data.pendingEvents.length} pending events`);
              for (const pendingEvent of data.pendingEvents) {
                if (pendingEvent.event === 'title') {
                  titleHandler(pendingEvent);
                } else if (pendingEvent.event === UsageEvents.ON_CONTEXT_USAGE) {
                  contextHandler(pendingEvent.data, resumeSubmission);
                } else if (pendingEvent.event === UsageEvents.ON_TOKEN_USAGE) {
                  usageHandler(pendingEvent.data, resumeSubmission);
                } else if (pendingEvent.event === ApprovalEvents.ON_PENDING_ACTION) {
                  // In-memory mode can surface a pause that landed between getResumeState()
                  // and the subscription here; route it to the same handler as a live event
                  // so the approval / ask-user controls render (else the stream sits paused
                  // with no UI until a full status reload).
                  applyPendingActionToMessages(pendingEvent.data as Agents.PendingAction);
                } else if (pendingEvent.event === SteerEvents.ON_STEER_APPLIED) {
                  applySteerToMessages(pendingEvent.data as TSteerAppliedEvent);
                } else if (pendingEvent.event != null) {
                  if (
                    pendingEvent.event === StepEvents.ON_MESSAGE_DELTA ||
                    pendingEvent.event === StepEvents.ON_REASONING_DELTA
                  ) {
                    tapStream(pendingEvent.data, resumeSubmission);
                  }
                  stepHandler(pendingEvent, resumeSubmission);
                } else if (pendingEvent.type != null) {
                  /** Gap output streamed past the resume snapshot must reach the
                   *  live estimate too, not just the message UI */
                  tapContent(pendingEvent.text, resumeSubmission);
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
            tapContent(text, { ...currentSubmission, userMessage });
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
            /** Legacy non-agent streams send cumulative text here — feed the
             *  live estimate like the content path above */
            tapContent(text, { ...currentSubmission, userMessage });
            messageHandler(text, { ...currentSubmission, userMessage, initialResponse });
          }
        } catch (error) {
          logger.error('ResumableSSE', 'Error processing message:', error);
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
        /* @ts-ignore - sse.js types don't expose responseCode */
        const responseCode = e.responseCode;

        if (finalReceived) {
          logger.log('ResumableSSE', 'Ignoring error after FINAL event', {
            responseCode,
            hasData: !!e.data,
          });
          return;
        }

        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();

        // 404 → job completed & was cleaned up; messages are persisted in DB.
        // Invalidate cache once so react-query refetches instead of showing an error.
        if (responseCode === 404) {
          const convoId = currentSubmission.conversation?.conversationId;
          logger.log('ResumableSSE', 'Stream 404, invalidating messages for:', convoId);
          sse.close();
          removeActiveJob(currentStreamId);
          /** Terminal: drop any in-flight live estimate so the gauge doesn't
           *  keep counting stale streamed output after the stream ends */
          resetLive({ ...currentSubmission, userMessage });
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
          const recoveryConvoId = convoId ?? currentStreamId;
          // Terminal for this run: the job is gone, so no event will ever
          // resolve an acknowledged chip — convert them to queued chips.
          convertLocalSteersToQueued(recoveryConvoId);
          // A terminal drain may have parked steers no subscriber received —
          // the status route claims them exactly once (same recovery as
          // useResumeOnLoad). Best-effort: chips are already converted above.
          fetchStreamStatus(recoveryConvoId)
            .then((status) => {
              const unrecovered = status.unrecoveredSteers ?? [];
              if (unrecovered.length > 0) {
                convertSteersToQueued(recoveryConvoId, unrecovered);
              }
            })
            .catch(() => undefined);
          // The true outcome is unknown here (job record already cleaned up):
          // a non-'completed' outcome releases parked interrupt flags without
          // auto-sending queued messages the user may not want fired.
          setRunEnd({
            conversationId: recoveryConvoId,
            outcome: 'aborted',
            startedAsNewConvo: optimisticStreamIdsRef.current.has(currentStreamId),
            endedAt: Date.now(),
          });
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
            logger.log('ResumableSSE', 'Token refresh failed:', error);
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
          logger.log('ResumableSSE', 'Server-sent error event received:', e.data);
          sse.close();
          removeActiveJob(currentStreamId);
          resetLive({ ...currentSubmission, userMessage });
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

            logger.log('ResumableSSE', 'Error type check:', { isKnownError, errorString });

            // Display the error to user via errorHandler
            errorHandler({
              data: { text: errorString } as unknown as Parameters<typeof errorHandler>[0]['data'],
              submission: currentSubmission as EventSubmission,
            });
          } catch (parseError) {
            logger.error('ResumableSSE', 'Failed to parse server error:', parseError);
            errorHandler({
              data: { text: e.data } as unknown as Parameters<typeof errorHandler>[0]['data'],
              submission: currentSubmission as EventSubmission,
            });
          }

          setIsSubmitting(false);
          setShowStopButton(false);
          // The error terminal's backstop parks acked leftovers server-side;
          // claim it now so a reload can't resurrect the chips converted here.
          convertLocalSteersToQueued(
            currentSubmission.conversation?.conversationId ?? currentStreamId,
            { claimParked: true },
          );
          setRunEnd({
            conversationId: currentSubmission.conversation?.conversationId ?? currentStreamId,
            outcome: 'error',
            endedAt: Date.now(),
          });
          setStreamId(null);
          optimisticStreamIdsRef.current.delete(currentStreamId);
          createdStreamIdsRef.current.delete(currentStreamId);
          reconnectAttemptRef.current = 0;
          return;
        }

        // Network failure or unknown HTTP error - attempt reconnection with backoff
        logger.log('ResumableSSE', 'Stream error (network failure) - will attempt reconnect', {
          responseCode,
          hasData: !!e.data,
        });

        if (reconnectAttemptRef.current < MAX_RETRIES) {
          // Increment counter BEFORE close() so abort handler knows we're reconnecting
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 30000);

          logger.log(
            'ResumableSSE',
            `Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RETRIES})`,
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
          logger.error('ResumableSSE', 'Max reconnect attempts reached');
          sse.close();
          errorHandler({ data: undefined, submission: currentSubmission as EventSubmission });
          /** Terminal: clear the in-flight live estimate like the other
           *  stop-reconnecting paths so the gauge doesn't show stale tokens */
          resetLive({ ...currentSubmission, userMessage });
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
          convertLocalSteersToQueued(
            currentSubmission.conversation?.conversationId ?? currentStreamId,
            { claimParked: true },
          );
          setRunEnd({
            conversationId: currentSubmission.conversation?.conversationId ?? currentStreamId,
            outcome: 'error',
            endedAt: Date.now(),
          });
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
          logger.log('ResumableSSE', 'Stream closed for reconnect - preserving state');
          return;
        }

        logger.log('ResumableSSE', 'Stream aborted (intentional close) - no reconnect');
        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        // Reset UI state - useResumeOnLoad will restore if user returns to this conversation
        setIsSubmitting(false);
        setShowStopButton(false);
        setStreamId(null);
        /** Intentional close without a final event (explicit stop, or navigation
         *  while generating): discard the in-flight pending usage so it can't
         *  merge into the next response in this conversation. On a resume the
         *  collected usage is re-folded via backfillUsage, so nothing is lost. */
        resetLive({ ...currentSubmission, userMessage });
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
          logger.log('Debug', 'Simulating network drop...');
          // @ts-ignore - sse.js types are incorrect, dispatchEvent actually takes Event
          sse.dispatchEvent(new Event('error'));
        };

        /** Simulate clean close (navigation away) - triggers abort event → no reconnection */
        debugWindow.__closeClean = () => {
          logger.log('Debug', 'Simulating clean close (navigation away)...');
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
      contextHandler,
      usageHandler,
      tapStream,
      tapContent,
      finalizeUsage,
      backfillUsage,
      resetLive,
      seedLive,
      setRunEnd,
      resolveSteerChip,
      seedSteerChips,
      convertSteersToQueued,
      convertLocalSteersToQueued,
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
          const data = await request.post(url, payload);
          if (signal?.aborted) {
            return null;
          }
          const streamId = getStartGenerationStreamId(data);
          if (streamId) {
            logger.log('ResumableSSE', 'Generation started:', { streamId });
            return streamId;
          }

          lastError = { response: { data } };
          break;
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
            logger.log(
              'ResumableSSE',
              `${reason} starting generation, retrying in ${retryDelay}ms (attempt ${attempt}/${limit})`,
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

      logger.error('ResumableSSE', 'Error starting generation:', lastError);

      const errorData = toStartGenerationError(lastError)?.response?.data;
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
      logger.log('ResumableSSE', 'No submission, cleaning up');
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
    logger.log('ResumableSSE', 'Effect triggered', {
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
        logger.log('ResumableSSE', 'Resuming existing stream:', resumeStreamId);
        setStreamId(resumeStreamId);
        // Optimistically add to active jobs (in case it's not already there)
        addActiveJob(resumeStreamId);
        subscribeToStream(resumeStreamId, submission, true); // isResume=true
      } else {
        // New generation: start and then subscribe
        logger.log('ResumableSSE', 'Starting NEW generation');
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
          logger.error('ResumableSSE', 'Failed to get streamId from startGeneration');
        }
      }
    };

    initStream();

    return () => {
      logger.log('ResumableSSE', 'Cleanup - closing SSE, resetting UI state');
      startController.abort();
      // Cleanup on unmount/navigation - close connection but DO NOT abort backend
      // Reset UI state so it doesn't leak to other conversations
      // If user returns to this conversation, useResumeOnLoad will restore the state
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pendingActionRetryRef.current != null) {
        cancelAnimationFrame(pendingActionRetryRef.current);
        pendingActionRetryRef.current = null;
      }
      if (steerRetryRef.current != null) {
        cancelAnimationFrame(steerRetryRef.current);
        steerRetryRef.current = null;
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
