import { useEffect, useState, useRef } from 'react';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import {
  request,
  Constants,
  /* @ts-ignore */
  createPayload,
  LocalStorageKeys,
  removeNullishValues,
  ErrorTypes,
  alternateName,
} from 'librechat-data-provider';
import type { TMessage, TPayload, TSubmission, EventSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { TResData } from '~/common';
import { useGenTitleMutation, useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
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

const API_KEY_MESSAGE_REGEX = /api[\s-]*key/i;
const API_KEY_CONTEXT_REGEX =
  /(missing|invalid|provide|provided|available|unavailable|expired|set|configured|no\s+user|no\s*api|not\s+provided|not\s+set|required)/i;
const API_KEY_ERROR_CODES = new Set<string>(
  [
    ErrorTypes.NO_USER_KEY,
    ErrorTypes.INVALID_USER_KEY,
    ErrorTypes.EXPIRED_USER_KEY,
    'invalid_api_key',
    'no_api_key',
    'missing_api_key',
    'api_key_missing',
  ].map((code) => code.toLowerCase()),
);

const containsApiKeyError = (rawMessage: string | null, data?: unknown): boolean => {
  if (!rawMessage && data == null) {
    return false;
  }

  const visited = new Set<unknown>();
  const queue: unknown[] = [];

  if (rawMessage) {
    queue.push(rawMessage);
  }

  if (data !== undefined) {
    queue.push(data);
  }

  while (queue.length > 0) {
    const value = queue.shift();

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }
      const lower = normalized.toLowerCase();

      if (API_KEY_ERROR_CODES.has(lower)) {
        return true;
      }

      if (API_KEY_MESSAGE_REGEX.test(normalized) && API_KEY_CONTEXT_REGEX.test(normalized)) {
        return true;
      }

      continue;
    }

    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      continue;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        continue;
      }
      visited.add(value);

      if (Array.isArray(value)) {
        queue.push(...value);
      } else {
        queue.push(...Object.values(value as Record<string, unknown>));
      }
    }
  }

  return false;
};

const normalizeConversationId = (id?: string | null) => {
  if (id && id.length) {
    return id;
  }
  return Constants.NEW_CONVO;
};

const deriveModelStatusReason = ({
  rawMessage,
  data,
}: {
  rawMessage: string | null;
  data?: unknown;
}): 'api' | 'unavailable' | 'connection' | null => {
  if (containsApiKeyError(rawMessage, data)) {
    return 'api';
  }

  const inspect = (value: unknown): string | null => {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (
        /model/.test(normalized) &&
        (normalized.includes('not') ||
          normalized.includes('missing') ||
          normalized.includes('load') ||
          normalized.includes('unavailable') ||
          normalized.includes('inactive'))
      ) {
        return 'unavailable';
      }

      if (normalized.includes('connect') && normalized.includes('failed')) {
        return 'connection';
      }

      return null;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const result = inspect(entry);
        if (result) {
          return result;
        }
      }
    } else if (typeof value === 'object') {
      for (const val of Object.values(value as Record<string, unknown>)) {
        const result = inspect(val);
        if (result) {
          return result;
        }
      }
    }

    return null;
  };

  return (inspect(data) as 'unavailable' | 'connection' | null) ??
    ((inspect(rawMessage) as 'unavailable' | 'connection' | null) ?? null);
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

export default function useSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const genTitle = useGenTitleMutation();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));

  const { token, isAuthenticated } = useAuthContext();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const hasShownApiKeyToast = useRef(false);
  const [completed, setCompleted] = useState(new Set());
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));
  const setModelAvailability = useSetRecoilState(store.modelAvailability);

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

  useEffect(() => {
    if (submission == null || Object.keys(submission).length === 0) {
      return;
    }

    const submissionConvoId = normalizeConversationId(
      submission.userMessage?.conversationId ?? submission.conversation?.conversationId,
    );

    setModelAvailability((prev) => {
      if (!prev || !Object.keys(prev).length) {
        return prev;
      }
      if (prev[submissionConvoId]) {
        const next = { ...prev };
        delete next[submissionConvoId];
        return next;
      }
      return prev;
    });
    hasShownApiKeyToast.current = false;
    let { userMessage } = submission;

    const payloadData = createPayload(submission);
    let { payload } = payloadData;
    payload = removeNullishValues(payload) as TPayload;

    let textIndex = null;
    clearStepMaps();

    const sse = new SSE(payloadData.server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    sse.addEventListener('attachment', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        attachmentHandler({ data, submission: submission as EventSubmission });
      } catch (error) {
        console.error(error);
      }
    });

    sse.addEventListener('message', (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      if (data.final != null) {
        clearDraft(submission.conversation?.conversationId);
        const { plugins } = data;
        finalHandler(data, { ...submission, plugins } as EventSubmission);
        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
        const successConvoId = normalizeConversationId(
          data.conversation?.conversationId ?? submissionConvoId,
        );
        setModelAvailability((prev) => {
          if (prev[successConvoId]) {
            const next = { ...prev };
            delete next[successConvoId];
            return next;
          }
          return prev;
        });
        console.log('final', data);
        return;
      } else if (data.created != null) {
        const runId = v4();
        setActiveRunId(runId);
        userMessage = {
          ...userMessage,
          ...data.message,
          overrideParentMessageId: userMessage.overrideParentMessageId,
        };

        createdHandler(data, { ...submission, userMessage } as EventSubmission);
      } else if (data.event != null) {
        stepHandler(data, { ...submission, userMessage } as EventSubmission);
      } else if (data.sync != null) {
        const runId = v4();
        setActiveRunId(runId);
        /* synchronize messages to Assistants API as well as with real DB ID's */
        syncHandler(data, { ...submission, userMessage } as EventSubmission);
      } else if (data.type != null) {
        const { text, index } = data;
        if (text != null && index !== textIndex) {
          textIndex = index;
        }

        contentHandler({ data, submission: submission as EventSubmission });
      } else {
        const text = data.text ?? data.response;
        const { plugin, plugins } = data;

        const initialResponse = {
          ...(submission.initialResponse as TMessage),
          parentMessageId: data.parentMessageId,
          messageId: data.messageId,
        };

        if (data.message != null) {
          messageHandler(text, { ...submission, plugin, plugins, userMessage, initialResponse });
        }
      }
    });

    sse.addEventListener('open', () => {
      setAbortScroll(false);
      console.log('connection is opened');
    });

    sse.addEventListener('cancel', async () => {
      const streamKey = (submission as TSubmission | null)?.['initialResponse']?.messageId;
      if (completed.has(streamKey)) {
        setIsSubmitting(false);
        setCompleted((prev) => {
          prev.delete(streamKey);
          return new Set(prev);
        });
        return;
      }

      setCompleted((prev) => new Set(prev.add(streamKey)));
      const latestMessages = getMessages();
      const conversationId = latestMessages?.[latestMessages.length - 1]?.conversationId;
      return await abortConversation(
        conversationId ??
          userMessage.conversationId ??
          submission.conversation?.conversationId ??
          '',
        submission as EventSubmission,
        latestMessages,
      );
    });

    sse.addEventListener('error', async (e: MessageEvent) => {
      /* @ts-ignore */
      if (e.responseCode === 401) {
        /* token expired, refresh and retry */
        try {
          const refreshResponse = await request.refreshToken();
          const token = refreshResponse?.token ?? '';
          if (!token) {
            throw new Error('Token refresh failed.');
          }
          sse.headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          };

          request.dispatchTokenUpdatedEvent(token);
          sse.stream();
          return;
        } catch (error) {
          /* token refresh failed, continue handling the original 401 */
          console.log(error);
        }
      }

      console.log('error in server stream.');
      (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();

      let data: TResData | undefined = undefined;
      const rawMessage = typeof e.data === 'string' ? e.data : null;
      if (rawMessage) {
        try {
          data = JSON.parse(rawMessage) as TResData;
        } catch (error) {
          console.error(error);
          console.log(e);
          setIsSubmitting(false);
        }
      } else if (typeof e.data === 'object' && e.data !== null) {
        data = e.data as TResData;
      }

      if (!hasShownApiKeyToast.current && containsApiKeyError(rawMessage, data)) {
        hasShownApiKeyToast.current = true;
        showToast({
          message: localize('com_error_no_user_key'),
          status: 'error',
        });
      }

      const availabilityReason = deriveModelStatusReason({ rawMessage, data });
      if (availabilityReason) {
        const statusConversationId = normalizeConversationId(
          data?.conversationId ??
            data?.conversation?.conversationId ??
            userMessage.conversationId ??
            submission.conversation?.conversationId ??
            submissionConvoId,
        );
        const endpoint = submission.conversation?.endpoint ?? submission.endpointOption?.endpoint;
        const endpointLabel = (endpoint && alternateName[endpoint]) || endpoint;
        let message = '';

        const providerLabel = endpointLabel ?? localize('com_endpoint_ai');
        if (availabilityReason === 'api') {
          message = `${providerLabel} requires an API key or service configuration before it can be used.`;
        } else if (availabilityReason === 'connection') {
          message = `${providerLabel} connection failed. Please ensure the service is running.`;
        } else {
          message = localize('com_error_endpoint_models_not_loaded', { 0: providerLabel });
        }

        setModelAvailability((prev) => ({ ...prev, [statusConversationId]: message }));
      }

      errorHandler({ data, submission: { ...submission, userMessage } as EventSubmission });
    });

    setIsSubmitting(true);
    sse.stream();

    return () => {
      const isCancelled = sse.readyState <= 1;
      sse.close();
      if (isCancelled) {
        const e = new Event('cancel');
        /* @ts-ignore */
        sse.dispatchEvent(e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);
}
