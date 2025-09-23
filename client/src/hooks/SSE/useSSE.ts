import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useA2ATaskPolling, { startPollingFromFinalEvent } from '~/hooks/A2A/useA2ATaskPolling';
import { extractMetaFromFinal, logA2ACreated, logA2AFinal } from '~/hooks/A2A/useA2ASSE';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import {
  request,
  Constants,
  QueryKeys,
  /* @ts-ignore */
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

export default function useSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const genTitle = useGenTitleMutation();
  const queryClient = useQueryClient();
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

  const a2aPolling = useA2ATaskPolling();


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

    // Main SSE handler: routes server events to existing chat handlers.
    // For A2A tasks: we only start polling after the final event,
    // and we avoid mutating local message parents to prevent permanent forks.
    sse.addEventListener('message', (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      if (data.final != null) {
        clearDraft(submission.conversation?.conversationId);
        const { plugins } = data;
        finalHandler(data, { ...submission, plugins } as EventSubmission);
        (startupConfig?.balance?.enabled ?? false) && balanceQuery.refetch();
        // Debug aid: log A2A final for troubleshooting
        logA2AFinal(data);

        // A2A-only: use extracted meta and delegate to helper
        startPollingFromFinalEvent(a2aPolling, data, getMessages, setMessages);
        return;
      } else if (data.created != null) {
        const runId = v4();
        setActiveRunId(runId);
        // Debug aid: log A2A created
        logA2ACreated(data, getMessages);
        // Do not override parents here. The server determines final parentage
        // to avoid mid-task forks. We simply forward the created event.
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

      // <stripe>
      // Removing refresh token logic for 401 error
      // </stripe>

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
      // Do not stop A2A polling here; starting a new request should not cancel
      // background task polling. Polling stops on terminal status or page unload.
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

// Ensure background polling is halted on full page unload/navigation
// without interfering with in-app sync chats between polls
export function useA2APollingOnUnload() {
  const a2aPolling = useA2ATaskPolling();
  useEffect(() => {
    const onBeforeUnload = () => {
      a2aPolling.stop();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
