import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import {
  /* @ts-ignore */
  SSE,
  QueryKeys,
  Constants,
  EndpointURLs,
  createPayload,
  tPresetSchema,
  tMessageSchema,
  LocalStorageKeys,
  tConvoUpdateSchema,
  removeNullishValues,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type {
  TResPlugin,
  TMessage,
  TConversation,
  TSubmission,
  ConversationData,
} from 'librechat-data-provider';
import {
  addConversation,
  deleteConversation,
  updateConversation,
  getConversationById,
} from '~/utils';
import { useGenTitleMutation } from '~/data-provider';
import useContentHandler from './useContentHandler';
import { useAuthContext } from '../AuthContext';
import useChatHelpers from '../useChatHelpers';
import store from '~/store';

type TResData = {
  plugin?: TResPlugin;
  final?: boolean;
  initial?: boolean;
  previousMessages?: TMessage[];
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversation: TConversation;
  conversationId?: string;
  runMessages?: TMessage[];
};

type TSyncData = {
  sync: boolean;
  thread_id: string;
  messages?: TMessage[];
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversationId: string;
};

export default function useSSE(submission: TSubmission | null, index = 0) {
  const queryClient = useQueryClient();
  const genTitle = useGenTitleMutation();
  const setActiveRunId = useSetRecoilState(store.activeRunFamily(index));

  const { conversationId: paramId } = useParams();
  const { token, isAuthenticated } = useAuthContext();
  const [completed, setCompleted] = useState(new Set());
  const setShowStopButton = useSetRecoilState(store.showStopButtonByIndex(index));

  const {
    setMessages,
    getMessages,
    setConversation,
    setIsSubmitting,
    newConversation,
    resetLatestMessage,
  } = useChatHelpers(index, paramId);
  const contentHandler = useContentHandler({ setMessages, getMessages });

  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.checkBalance,
  });

  const messageHandler = useCallback(
    (data: string, submission: TSubmission) => {
      const {
        messages,
        userMessage,
        plugin,
        plugins,
        initialResponse,
        isRegenerate = false,
      } = submission;

      if (isRegenerate) {
        setMessages([
          ...messages,
          {
            ...initialResponse,
            text: data,
            plugin: plugin ?? null,
            plugins: plugins ?? [],
            // unfinished: true
          },
        ]);
      } else {
        setMessages([
          ...messages,
          userMessage,
          {
            ...initialResponse,
            text: data,
            plugin: plugin ?? null,
            plugins: plugins ?? [],
            // unfinished: true
          },
        ]);
      }
    },
    [setMessages],
  );

  const cancelHandler = useCallback(
    (data: TResData, submission: TSubmission) => {
      const { requestMessage, responseMessage, conversation } = data;
      const { messages, isRegenerate = false } = submission;

      const convoUpdate = conversation ?? submission.conversation;

      // update the messages
      if (isRegenerate) {
        const messagesUpdate = [...messages, responseMessage].filter((msg) => msg);
        setMessages(messagesUpdate);
      } else {
        const messagesUpdate = [...messages, requestMessage, responseMessage].filter((msg) => msg);
        setMessages(messagesUpdate);
      }

      const isNewConvo = conversation.conversationId !== submission.conversation.conversationId;
      if (isNewConvo) {
        queryClient.setQueryData<ConversationData>([QueryKeys.allConversations], (convoData) => {
          if (!convoData) {
            return convoData;
          }
          return deleteConversation(convoData, submission.conversation.conversationId as string);
        });
      }

      // refresh title
      if (isNewConvo && requestMessage?.parentMessageId === Constants.NO_PARENT) {
        setTimeout(() => {
          genTitle.mutate({ conversationId: convoUpdate.conversationId as string });
        }, 2500);
      }

      setConversation((prevState) => {
        const update = {
          ...prevState,
          ...convoUpdate,
        };

        return update;
      });

      setIsSubmitting(false);
    },
    [setMessages, setConversation, genTitle, queryClient, setIsSubmitting],
  );

  const syncHandler = useCallback(
    (data: TSyncData, submission: TSubmission) => {
      const { conversationId, thread_id, responseMessage, requestMessage } = data;
      const { initialResponse, messages: _messages, userMessage } = submission;

      const messages = _messages.filter((msg) => msg.messageId !== userMessage.messageId);

      setMessages([
        ...messages,
        requestMessage,
        {
          ...initialResponse,
          ...responseMessage,
        },
      ]);

      let update = {} as TConversation;
      setConversation((prevState) => {
        let title = prevState?.title;
        const parentId = requestMessage.parentMessageId;
        if (parentId !== Constants.NO_PARENT && title?.toLowerCase()?.includes('new chat')) {
          const convos = queryClient.getQueryData<ConversationData>([QueryKeys.allConversations]);
          const cachedConvo = getConversationById(convos, conversationId);
          title = cachedConvo?.title;
        }

        update = tConvoUpdateSchema.parse({
          ...prevState,
          conversationId,
          thread_id,
          title,
          messages: [requestMessage.messageId, responseMessage.messageId],
        }) as TConversation;

        return update;
      });

      queryClient.setQueryData<ConversationData>([QueryKeys.allConversations], (convoData) => {
        if (!convoData) {
          return convoData;
        }
        if (requestMessage.parentMessageId === Constants.NO_PARENT) {
          return addConversation(convoData, update);
        } else {
          return updateConversation(convoData, update);
        }
      });

      setShowStopButton(true);

      resetLatestMessage();
    },
    [setMessages, setConversation, queryClient, setShowStopButton, resetLatestMessage],
  );

  const createdHandler = useCallback(
    (data: TResData, submission: TSubmission) => {
      const { messages, userMessage, isRegenerate = false } = submission;
      const initialResponse = {
        ...submission.initialResponse,
        parentMessageId: userMessage?.messageId,
        messageId: userMessage?.messageId + '_',
      };
      if (isRegenerate) {
        setMessages([...messages, initialResponse]);
      } else {
        setMessages([...messages, userMessage, initialResponse]);
      }

      const { conversationId, parentMessageId } = userMessage;

      let update = {} as TConversation;
      setConversation((prevState) => {
        let title = prevState?.title;
        const parentId = isRegenerate ? userMessage?.overrideParentMessageId : parentMessageId;
        if (parentId !== Constants.NO_PARENT && title?.toLowerCase()?.includes('new chat')) {
          const convos = queryClient.getQueryData<ConversationData>([QueryKeys.allConversations]);
          const cachedConvo = getConversationById(convos, conversationId);
          title = cachedConvo?.title;
        }

        update = tConvoUpdateSchema.parse({
          ...prevState,
          conversationId,
          title,
        }) as TConversation;

        return update;
      });

      queryClient.setQueryData<ConversationData>([QueryKeys.allConversations], (convoData) => {
        if (!convoData) {
          return convoData;
        }
        if (parentMessageId === Constants.NO_PARENT) {
          return addConversation(convoData, update);
        } else {
          return updateConversation(convoData, update);
        }
      });
      resetLatestMessage();
    },
    [setMessages, setConversation, queryClient, resetLatestMessage],
  );

  const finalHandler = useCallback(
    (data: TResData, submission: TSubmission) => {
      const { requestMessage, responseMessage, conversation, runMessages } = data;
      const { messages, conversation: submissionConvo, isRegenerate = false } = submission;

      setShowStopButton(false);
      setCompleted((prev) => new Set(prev.add(submission?.initialResponse?.messageId)));

      const currentMessages = getMessages();
      // Early return if messages are empty; i.e., the user navigated away
      if (!currentMessages?.length) {
        return setIsSubmitting(false);
      }

      // update the messages; if assistants endpoint, client doesn't receive responseMessage
      if (runMessages) {
        setMessages([...runMessages]);
      } else if (isRegenerate && responseMessage) {
        setMessages([...messages, responseMessage]);
      } else if (responseMessage) {
        setMessages([...messages, requestMessage, responseMessage]);
      }

      const isNewConvo = conversation.conversationId !== submissionConvo.conversationId;
      if (isNewConvo) {
        queryClient.setQueryData<ConversationData>([QueryKeys.allConversations], (convoData) => {
          if (!convoData) {
            return convoData;
          }
          return deleteConversation(convoData, submissionConvo.conversationId as string);
        });
      }

      // refresh title
      if (isNewConvo && requestMessage && requestMessage.parentMessageId === Constants.NO_PARENT) {
        setTimeout(() => {
          genTitle.mutate({ conversationId: conversation.conversationId as string });
        }, 2500);
      }

      setConversation((prevState) => {
        const update = {
          ...prevState,
          ...conversation,
        };

        if (prevState?.model && prevState.model !== submissionConvo.model) {
          update.model = prevState.model;
        }

        return update;
      });

      setIsSubmitting(false);
    },
    [
      genTitle,
      queryClient,
      getMessages,
      setMessages,
      setConversation,
      setIsSubmitting,
      setShowStopButton,
    ],
  );

  const errorHandler = useCallback(
    ({ data, submission }: { data?: TResData; submission: TSubmission }) => {
      const { messages, userMessage, initialResponse } = submission;

      setCompleted((prev) => new Set(prev.add(initialResponse.messageId)));

      const conversationId = userMessage?.conversationId ?? submission?.conversationId;

      const parseErrorResponse = (data: TResData | Partial<TMessage>) => {
        const metadata = data['responseMessage'] ?? data;
        const errorMessage = {
          ...initialResponse,
          ...metadata,
          error: true,
          parentMessageId: userMessage?.messageId,
        };

        if (!errorMessage.messageId) {
          errorMessage.messageId = v4();
        }

        return tMessageSchema.parse(errorMessage);
      };

      if (!data) {
        const convoId = conversationId ?? v4();
        const errorResponse = parseErrorResponse({
          text: 'Error connecting to server, try refreshing the page.',
          ...submission,
          conversationId: convoId,
        });
        setMessages([...messages, userMessage, errorResponse]);
        newConversation({
          template: { conversationId: convoId },
          preset: tPresetSchema.parse(submission?.conversation),
        });
        setIsSubmitting(false);
        return;
      }

      if (!conversationId && !data.conversationId) {
        const convoId = v4();
        const errorResponse = parseErrorResponse(data);
        setMessages([...messages, userMessage, errorResponse]);
        newConversation({
          template: { conversationId: convoId },
          preset: tPresetSchema.parse(submission?.conversation),
        });
        setIsSubmitting(false);
        return;
      } else if (!data.conversationId) {
        const errorResponse = parseErrorResponse(data);
        setMessages([...messages, userMessage, errorResponse]);
        setIsSubmitting(false);
        return;
      }

      console.log('Error:', data);
      const errorResponse = tMessageSchema.parse({
        ...data,
        error: true,
        parentMessageId: userMessage?.messageId,
      });

      setMessages([...messages, userMessage, errorResponse]);
      if (data.conversationId && paramId === 'new') {
        newConversation({
          template: { conversationId: data.conversationId },
          preset: tPresetSchema.parse(submission?.conversation),
        });
      }

      setIsSubmitting(false);
      return;
    },
    [setMessages, paramId, setIsSubmitting, newConversation],
  );

  const abortConversation = useCallback(
    async (conversationId = '', submission: TSubmission) => {
      let runAbortKey = '';
      try {
        const conversation = (JSON.parse(
          localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP) ?? '',
        ) ?? {}) as TConversation;
        const { conversationId, messages } = conversation;
        runAbortKey = `${conversationId}:${messages?.[messages.length - 1]}`;
      } catch (error) {
        console.error('Error getting last conversation setup');
        console.error(error);
      }
      const { endpoint: _endpoint, endpointType } = submission?.conversation || {};
      const endpoint = endpointType ?? _endpoint;
      try {
        const response = await fetch(`${EndpointURLs[endpoint ?? '']}/abort`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            abortKey: isAssistantsEndpoint(_endpoint) ? runAbortKey : conversationId,
            endpoint,
          }),
        });

        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log('aborted', data);
          if (response.status === 404) {
            setIsSubmitting(false);
            return;
          }
          if (data.final) {
            finalHandler(data, submission);
          } else {
            cancelHandler(data, submission);
          }
        } else if (response.status === 204) {
          const responseMessage = {
            ...submission.initialResponse,
          };

          const data = {
            requestMessage: submission.userMessage,
            responseMessage: responseMessage,
            conversation: submission.conversation,
          };
          console.log('aborted', data);
        } else {
          throw new Error(
            'Unexpected response from server; Status: ' +
              response.status +
              ' ' +
              response.statusText,
          );
        }
      } catch (error) {
        console.error('Error cancelling request');
        console.error(error);
        const convoId = conversationId ?? v4();
        const text =
          submission.initialResponse?.text?.length > 45 ? submission.initialResponse?.text : '';
        const errorMessage = {
          ...submission,
          ...submission.initialResponse,
          text: text ?? (error as Error).message ?? 'Error cancelling request',
          unfinished: !!text.length,
          error: true,
        };
        const errorResponse = tMessageSchema.parse(errorMessage);
        setMessages([...submission.messages, submission.userMessage, errorResponse]);
        newConversation({
          template: { conversationId: convoId },
          preset: tPresetSchema.parse(submission?.conversation),
        });
        setIsSubmitting(false);
      }
    },
    [token, setIsSubmitting, finalHandler, cancelHandler, setMessages, newConversation],
  );

  useEffect(() => {
    if (submission === null || Object.keys(submission).length === 0) {
      return;
    }

    let { userMessage } = submission;

    const payloadData = createPayload(submission);
    let { payload } = payloadData;
    if (isAssistantsEndpoint(payload.endpoint)) {
      payload = removeNullishValues(payload);
    }

    let textIndex = null;

    const events = new SSE(payloadData.server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    events.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      if (data.final) {
        const { plugins } = data;
        finalHandler(data, { ...submission, plugins });
        startupConfig?.checkBalance && balanceQuery.refetch();
        console.log('final', data);
      }
      if (data.created) {
        const runId = v4();
        setActiveRunId(runId);
        userMessage = {
          ...userMessage,
          ...data.message,
          overrideParentMessageId: userMessage?.overrideParentMessageId,
        };

        createdHandler(data, { ...submission, userMessage });
      } else if (data.sync) {
        const runId = v4();
        setActiveRunId(runId);
        /* synchronize messages to Assistants API as well as with real DB ID's */
        syncHandler(data, { ...submission, userMessage });
      } else if (data.type) {
        const { text, index } = data;
        if (text && index !== textIndex) {
          textIndex = index;
        }

        contentHandler({ data, submission });
      } else {
        const text = data.text || data.response;
        const { plugin, plugins } = data;

        const initialResponse = {
          ...submission.initialResponse,
          parentMessageId: data.parentMessageId,
          messageId: data.messageId,
        };

        if (data.message) {
          messageHandler(text, { ...submission, plugin, plugins, userMessage, initialResponse });
        }
      }
    };

    // events.onaudio = (e: MessageEvent) => {
    //   const data = JSON.parse(e.data);
    //   console.log('audio', data);
    //   if (data.audio) {
    //     audioSource.addBase64Data(data.audio);
    //   }
    // };

    // events.onend = () => audioSource.close();

    events.onopen = () => console.log('connection is opened');

    events.oncancel = async () => {
      const streamKey = submission?.initialResponse?.messageId;
      if (completed.has(streamKey)) {
        setIsSubmitting(false);
        setCompleted((prev) => {
          prev.delete(streamKey);
          return new Set(prev);
        });
        return;
      }

      setCompleted((prev) => new Set(prev.add(streamKey)));
      return await abortConversation(
        userMessage?.conversationId ?? submission?.conversationId,
        submission,
      );
    };

    events.onerror = function (e: MessageEvent) {
      console.log('error in server stream.');
      startupConfig?.checkBalance && balanceQuery.refetch();
      events.close();

      let data: TResData | undefined = undefined;
      try {
        data = JSON.parse(e.data) as TResData;
      } catch (error) {
        console.error(error);
        console.log(e);
        setIsSubmitting(false);
      }

      errorHandler({ data, submission: { ...submission, userMessage } });
    };

    setIsSubmitting(true);
    events.stream();

    return () => {
      const isCancelled = events.readyState <= 1;
      events.close();
      // setSource(null);
      if (isCancelled) {
        const e = new Event('cancel');
        events.dispatchEvent(e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);
}
