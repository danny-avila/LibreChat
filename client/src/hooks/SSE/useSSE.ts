import { useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { SSE } from 'sse.js';
import { useSetRecoilState } from 'recoil';
import {
  request,
  createPayload,
  isAgentsEndpoint,
  removeNullishValues,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { EventSubmission, TMessage, TPayload, TSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import type { TResData } from '~/common';
import { useGenTitleMutation, useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import useEventHandlers from './useEventHandlers';
import store from '~/store';
import { createPayloadWithEncryption } from '~/hooks/SSE/encryptionHelpers';

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
  encryptionEnabled: boolean = false // Flag to enable/disable encryption
) {
  const genTitle = useGenTitleMutation();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(runIndex));

  const { token, isAuthenticated, user } = useAuthContext();
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
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });

  useEffect(() => {
    if (submission == null || Object.keys(submission).length === 0) {
      return;
    }

    (async () => {
      let payloadData;
      // Use encryption if encryptionEnabled is true OR if the user has a public key.
      if ((encryptionEnabled || (user && user.encryptionPublicKey)) && user?.encryptionPublicKey) {
        payloadData = await createPayloadWithEncryption(
          submission,
          true,
          user.encryptionPublicKey
        );
      } else {
        payloadData = createPayload(submission);
      }

      let { payload } = payloadData;
      if (isAssistantsEndpoint(payload.endpoint) || isAgentsEndpoint(payload.endpoint)) {
        payload = removeNullishValues(payload) as TPayload;
      }

      let textIndex: number | null = null;

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
          const { plugins } = data;
          finalHandler(data, { ...submission, plugins } as EventSubmission);
          if (startupConfig?.checkBalance) {balanceQuery.refetch();}
          console.log('final', data);
          return;
        } else if (data.created != null) {
          const runId = v4();
          setActiveRunId(runId);
          submission.userMessage = {
            ...submission.userMessage,
            ...data.message,
            overrideParentMessageId: submission.userMessage.overrideParentMessageId,
          };

          createdHandler(data, { ...submission } as EventSubmission);
        } else if (data.event != null) {
          stepHandler(data, { ...submission } as EventSubmission);
        } else if (data.sync != null) {
          const runId = v4();
          setActiveRunId(runId);
          syncHandler(data, { ...submission } as EventSubmission);
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
            messageHandler(text, { ...submission, plugin, plugins, initialResponse });
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
        const conversationId =
          latestMessages?.[latestMessages.length - 1]?.conversationId;
        return await abortConversation(
          conversationId ?? submission.userMessage.conversationId ?? submission.conversationId,
          submission as EventSubmission,
          latestMessages
        );
      });

      sse.addEventListener('error', async (e: MessageEvent) => {
        if ((e as any).responseCode === 401) {
          try {
            const refreshResponse = await request.refreshToken();
            const newToken = refreshResponse?.token ?? '';
            if (!newToken) {throw new Error('Token refresh failed.');}
            sse.headers = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${newToken}`,
            };
            request.dispatchTokenUpdatedEvent(newToken);
            sse.stream();
            return;
          } catch (error) {
            console.log(error);
          }
        }

        console.log('error in server stream.');
        if (startupConfig?.checkBalance) {balanceQuery.refetch();}

        let data: TResData | undefined = undefined;
        try {
          data = JSON.parse(e.data) as TResData;
        } catch (error) {
          console.error(error);
          console.log(e);
          setIsSubmitting(false);
        }

        errorHandler({ data, submission: { ...submission } as EventSubmission });
      });

      setIsSubmitting(true);
      sse.stream();

      return () => {
        const isCancelled = sse.readyState <= 1;
        sse.close();
        if (isCancelled) {
          const event = new Event('cancel');
          sse.dispatchEvent(event);
        }
      };
    })();
  }, [submission, encryptionEnabled, user?.encryptionPublicKey]);
}