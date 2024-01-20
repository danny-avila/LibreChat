import { v4 } from 'uuid';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  /* @ts-ignore */
  SSE,
  EndpointURLs,
  createPayload,
  tPresetSchema,
  tMessageSchema,
  EModelEndpoint,
  tConvoUpdateSchema,
  removeNullishValues,
} from 'librechat-data-provider';
import { useGetUserBalance, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TResPlugin, TMessage, TConversation, TSubmission } from 'librechat-data-provider';
import { useAuthContext } from './AuthContext';
import useChatHelpers from './useChatHelpers';
import useSetStorage from './useSetStorage';

type TResData = {
  plugin?: TResPlugin;
  final?: boolean;
  initial?: boolean;
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversation: TConversation;
  conversationId?: string;
};

export default function useSSE(submission: TSubmission | null, index = 0) {
  const setStorage = useSetStorage();
  const { conversationId: paramId } = useParams();
  const { token, isAuthenticated } = useAuthContext();
  const [completed, setCompleted] = useState(new Set());
  const {
    addConvo,
    setMessages,
    setConversation,
    setIsSubmitting,
    resetLatestMessage,
    invalidateConvos,
    newConversation,
  } = useChatHelpers(index, paramId);

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

    // refresh title
    if (requestMessage?.parentMessageId == '00000000-0000-0000-0000-000000000000') {
      setTimeout(() => {
        invalidateConvos();
      }, 2000);

      // in case it takes too long.
      setTimeout(() => {
        invalidateConvos();
      }, 5000);
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
    if (message.parentMessageId == '00000000-0000-0000-0000-000000000000') {
      addConvo(update);
    }
    resetLatestMessage();
  };

  const finalHandler = (data: TResData, submission: TSubmission) => {
    const { requestMessage, responseMessage, conversation } = data;
    const { messages, conversation: submissionConvo, isRegenerate = false } = submission;

    setCompleted((prev) => new Set(prev.add(submission?.initialResponse?.messageId)));

    // update the messages
    if (isRegenerate) {
      setMessages([...messages, responseMessage]);
    } else {
      setMessages([...messages, requestMessage, responseMessage]);
    }

    // refresh title
    if (requestMessage.parentMessageId == '00000000-0000-0000-0000-000000000000') {
      setTimeout(() => {
        invalidateConvos();
      }, 1500);

      // in case it takes too long.
      setTimeout(() => {
        invalidateConvos();
      }, 5000);
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

  const abortConversation = (conversationId = '', submission: TSubmission) => {
    console.log(submission);
    const { endpoint: _endpoint, endpointType } = submission?.conversation || {};
    const endpoint = endpointType ?? _endpoint;
    let res: Response;

    fetch(`${EndpointURLs[endpoint ?? '']}/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        abortKey: conversationId,
      }),
    })
      .then((response) => {
        res = response;
        // Check if the response is JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return response.json();
        } else if (response.status === 204) {
          const responseMessage = {
            ...submission.initialResponse,
            text: submission.initialResponse.text.replace(
              '<span className="result-streaming">█</span>',
              '',
            ),
          };

          return {
            requestMessage: submission.message,
            responseMessage: responseMessage,
            conversation: submission.conversation,
          };
        } else {
          throw new Error(
            'Unexpected response from server; Status: ' + res.status + ' ' + res.statusText,
          );
        }
      })
      .then((data) => {
        console.log('aborted', data);
        if (res.status === 404) {
          return setIsSubmitting(false);
        }
        cancelHandler(data, submission);
      })
      .catch((error) => {
        console.error('Error aborting request');
        console.error(error);
        const convoId = conversationId ?? v4();

        const text =
          submission.initialResponse?.text?.length > 45 ? submission.initialResponse?.text : '';

        const errorMessage = {
          ...submission,
          ...submission.initialResponse,
          text: text ?? error.message ?? 'Error cancelling request',
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
      });
    return;
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
    if (payload.endpoint === EModelEndpoint.assistant) {
      payload = removeNullishValues(payload);
    }

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
      } else {
        const text = data.text || data.response;
        const { plugin, plugins } = data;

        if (data.message) {
          messageHandler(text, { ...submission, plugin, plugins, message });
        }
      }
    };

    events.onopen = () => console.log('connection is opened');

    events.oncancel = () => {
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
      return abortConversation(message?.conversationId ?? submission?.conversationId, submission);
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
