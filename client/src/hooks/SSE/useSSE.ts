import { v4 } from 'uuid';
import { useSetRecoilState } from 'recoil';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  /* @ts-ignore */
  SSE,
  QueryKeys,
  EndpointURLs,
  Constants,
  createPayload,
  tPresetSchema,
  tMessageSchema,
  EModelEndpoint,
  tConvoUpdateSchema,
  removeNullishValues,
} from 'librechat-data-provider';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type {
  TResPlugin,
  TMessage,
  TConversation,
  TSubmission,
  ConversationData,
} from 'librechat-data-provider';
import { addConversation, deleteConversation, updateConversation } from '~/utils';
import { useGenTitleMutation } from '~/data-provider';
import useContentHandler from './useContentHandler';
import { useAuthContext } from '../AuthContext';
import useChatHelpers from '../useChatHelpers';
import useSetStorage from '../useSetStorage';
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
  const setStorage = useSetStorage();
  const queryClient = useQueryClient();
  const genTitle = useGenTitleMutation();

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

  const messageHandler = (data: string, submission: TSubmission) => {
    const {
      messages,
      message,
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
          parentMessageId: message?.overrideParentMessageId ?? null,
          messageId: message?.overrideParentMessageId + '_',
          plugin: plugin ?? null,
          plugins: plugins ?? [],
          // unfinished: true
        },
      ]);
    } else {
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.messageId,
          messageId: message?.messageId + '_',
          plugin: plugin ?? null,
          plugins: plugins ?? [],
          // unfinished: true
        },
      ]);
    }
  };

  const cancelHandler = (data: TResData, submission: TSubmission) => {
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

      setStorage(update);
      return update;
    });

    setIsSubmitting(false);
  };

  const syncHandler = (data: TSyncData, submission: TSubmission) => {
    const { conversationId, thread_id, responseMessage, requestMessage } = data;
    const { initialResponse, messages: _messages, message } = submission;

    const messages = _messages.filter((msg) => msg.messageId !== message.messageId);

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
      update = tConvoUpdateSchema.parse({
        ...prevState,
        conversationId,
        thread_id,
        messages: [requestMessage.messageId, responseMessage.messageId],
      }) as TConversation;

      setStorage(update);
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
  };

  const createdHandler = (data: TResData, submission: TSubmission) => {
    const { messages, message, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate) {
      setMessages([
        ...messages,
        {
          ...initialResponse,
          parentMessageId: message?.overrideParentMessageId ?? null,
          messageId: message?.overrideParentMessageId + '_',
        },
      ]);
    } else {
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          parentMessageId: message?.messageId,
          messageId: message?.messageId + '_',
        },
      ]);
    }

    const { conversationId } = message;

    let update = {} as TConversation;
    setConversation((prevState) => {
      update = tConvoUpdateSchema.parse({
        ...prevState,
        conversationId,
      }) as TConversation;

      setStorage(update);
      return update;
    });

    queryClient.setQueryData<ConversationData>([QueryKeys.allConversations], (convoData) => {
      if (!convoData) {
        return convoData;
      }
      if (message.parentMessageId === Constants.NO_PARENT) {
        return addConversation(convoData, update);
      } else {
        return updateConversation(convoData, update);
      }
    });
    resetLatestMessage();
  };

  const finalHandler = (data: TResData, submission: TSubmission) => {
    const { requestMessage, responseMessage, conversation, runMessages } = data;
    const { messages, conversation: submissionConvo, isRegenerate = false } = submission;

    setShowStopButton(false);
    setCompleted((prev) => new Set(prev.add(submission?.initialResponse?.messageId)));

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

      // Revert to previous model if the model was auto-switched by backend due to message attachments
      if (conversation.model?.includes('vision') && !submissionConvo.model?.includes('vision')) {
        update.model = submissionConvo?.model;
      }

      setStorage(update);
      return update;
    });

    setIsSubmitting(false);
  };

  const errorHandler = ({ data, submission }: { data?: TResData; submission: TSubmission }) => {
    const { messages, message, initialResponse } = submission;

    setCompleted((prev) => new Set(prev.add(initialResponse.messageId)));

    const conversationId = message?.conversationId ?? submission?.conversationId;

    const parseErrorResponse = (data: TResData | Partial<TMessage>) => {
      const metadata = data['responseMessage'] ?? data;
      const errorMessage = {
        ...initialResponse,
        ...metadata,
        error: true,
        parentMessageId: message?.messageId,
      };

      if (!errorMessage.messageId) {
        errorMessage.messageId = v4();
      }

      return tMessageSchema.parse(errorMessage);
    };

    if (!data) {
      const convoId = conversationId ?? v4();
      const errorResponse = parseErrorResponse({
        text: 'Error connecting to server',
        ...submission,
        conversationId: convoId,
      });
      setMessages([...messages, message, errorResponse]);
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
      setMessages([...messages, message, errorResponse]);
      newConversation({
        template: { conversationId: convoId },
        preset: tPresetSchema.parse(submission?.conversation),
      });
      setIsSubmitting(false);
      return;
    }

    console.log('Error:', data);
    const errorResponse = tMessageSchema.parse({
      ...data,
      error: true,
      parentMessageId: message?.messageId,
    });

    setMessages([...messages, message, errorResponse]);
    if (data.conversationId && paramId === 'new') {
      newConversation({
        template: { conversationId: data.conversationId },
        preset: tPresetSchema.parse(submission?.conversation),
      });
    }

    setIsSubmitting(false);
    return;
  };

  const abortConversation = async (conversationId = '', submission: TSubmission) => {
    console.log(submission);
    let runAbortKey = '';
    try {
      const conversation = (JSON.parse(localStorage.getItem('lastConversationSetup') ?? '') ??
        {}) as TConversation;
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
          abortKey: _endpoint === EModelEndpoint.assistants ? runAbortKey : conversationId,
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
          requestMessage: submission.message,
          responseMessage: responseMessage,
          conversation: submission.conversation,
        };
        console.log('aborted', data);
      } else {
        throw new Error(
          'Unexpected response from server; Status: ' + response.status + ' ' + response.statusText,
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
      setMessages([...submission.messages, submission.message, errorResponse]);
      newConversation({
        template: { conversationId: convoId },
        preset: tPresetSchema.parse(submission?.conversation),
      });
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (submission === null) {
      return;
    }
    if (Object.keys(submission).length === 0) {
      return;
    }

    let { message } = submission;

    const payloadData = createPayload(submission);
    let { payload } = payloadData;
    if (payload.endpoint === EModelEndpoint.assistants) {
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
        finalHandler(data, { ...submission, plugins, message });
        startupConfig?.checkBalance && balanceQuery.refetch();
        console.log('final', data);
      }
      if (data.created) {
        message = {
          ...message,
          ...data.message,
          overrideParentMessageId: message?.overrideParentMessageId,
        };
        createdHandler(data, { ...submission, message });
      } else if (data.sync) {
        /* synchronize messages to Assistants API as well as with real DB ID's */
        syncHandler(data, { ...submission, message });
      } else if (data.type) {
        const { text, index } = data;
        if (text && index !== textIndex) {
          textIndex = index;
        }

        contentHandler({ data, submission });
      } else {
        const text = data.text || data.response;
        const { plugin, plugins } = data;

        if (data.message) {
          messageHandler(text, { ...submission, plugin, plugins, message });
        }
      }
    };

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
        message?.conversationId ?? submission?.conversationId,
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
        return;
      }

      errorHandler({ data, submission: { ...submission, message } });
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
