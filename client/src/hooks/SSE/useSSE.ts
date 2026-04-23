import { useEffect, useState } from 'react';
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
} from 'librechat-data-provider';
import type { TMessage, TPayload, TSubmission, EventSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { TResData } from '~/common';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
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

export default function useSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));
  const { token, isAuthenticated } = useAuthContext();
  const [completed, setCompleted] = useState(new Set());
  const setAbortScroll = useSetRecoilState(store.abortScrollFamily(runIndex));
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(runIndex));

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

    let { userMessage } = submission;

    const payloadData = createPayload(submission);
    let { payload } = payloadData;
    payload = removeNullishValues(payload) as TPayload;

    let textIndex = null;
    clearStepMaps();

    const streamTiming = { startTime: Date.now(), firstTokenTime: null as number | null };
    let bklRequestId: string | null = null;

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
        const endTime = Date.now();
        const responseMessageId: string | undefined =
          data.responseMessage?.messageId ?? (data.final as Record<string, unknown>)?.messageId as string | undefined;
        if (responseMessageId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__bklTiming = (window as any).__bklTiming ?? {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__bklTiming[responseMessageId] = {
            startTime: streamTiming.startTime,
            firstTokenTime: streamTiming.firstTokenTime,
            endTime,
          };

          if (bklRequestId) {
            // Keep request_id mapping by messageId for citation modal source lookup.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const win = window as any;
            win.__bklRids = win.__bklRids ?? {};
            win.__bklRids[responseMessageId] = bklRequestId;

            // If `sources_replace` SSE already delivered the full source list,
            // copy it into the messageId-keyed dict so the citation drawer can
            // find it without any extra REST round-trip. This is critical on
            // remote deployments (vast / bkl-deploy) where the relative fetch
            // below would otherwise hit the LibreChat api server, not bkl-api.
            const pre = win.__bklSourcesByRid?.[bklRequestId];
            if (Array.isArray(pre) && pre.length > 0) {
              win.__bklSources = win.__bklSources ?? {};
              win.__bklSources[responseMessageId] = pre;
            } else {
              // Fallback — hit bkl-api through the same origin as LibreChat.
              // `/api` is not prefixed because LibreChat proxies BKL endpoints
              // at `/v1/...` via nginx in production compose.
              fetch(`/v1/sources/${bklRequestId}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((srcData) => {
                  if (!srcData) {
                    return;
                  }
                  win.__bklSources = win.__bklSources ?? {};
                  win.__bklSources[responseMessageId] = srcData.sources ?? srcData;
                })
                .catch((err) => {
                  console.error('[SSE] Failed to fetch BKL sources:', err);
                });
            }
          }
        }
        clearDraft(submission.conversation?.conversationId);
        try {
          finalHandler(data, submission as EventSubmission);
        } catch (error) {
          console.error('Error in finalHandler:', error);
          setIsSubmitting(false);
          setShowStopButton(false);
        }
        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
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
        if (data.type === 'request_id' && typeof data.request_id === 'string') {
          bklRequestId = data.request_id;
          return;
        }

        if (
          data.type === 'sources_replace' &&
          typeof data.request_id === 'string' &&
          Array.isArray(data.sources)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          win.__bklSourcesByRid = win.__bklSourcesByRid ?? {};
          win.__bklSourcesByRid[data.request_id] = data.sources;
          return;
        }

        const { text, index } = data;
        if (text != null && index !== textIndex) {
          textIndex = index;
        }

        contentHandler({ data, submission: submission as EventSubmission });
      } else {
        const text = data.text ?? data.response;

        if (streamTiming.firstTokenTime === null && text) {
          streamTiming.firstTokenTime = Date.now();
        }

        const initialResponse = {
          ...(submission.initialResponse as TMessage),
          parentMessageId: data.parentMessageId,
          messageId: data.messageId,
        };

        if (data.message != null) {
          messageHandler(text, { ...submission, userMessage, initialResponse });
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
      try {
        await abortConversation(
          conversationId ??
            userMessage.conversationId ??
            submission.conversation?.conversationId ??
            '',
          submission as EventSubmission,
          latestMessages,
        );
      } catch (error) {
        console.error('Error during abort:', error);
        setIsSubmitting(false);
        setShowStopButton(false);
      }
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
      try {
        data = JSON.parse(e.data) as TResData;
      } catch (error) {
        console.error(error);
        console.log(e);
        setIsSubmitting(false);
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
