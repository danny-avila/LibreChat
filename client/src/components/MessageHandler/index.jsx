import React, { useEffect, useRef, useState } from 'react';
import { useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import { SSE } from '~/utils/sse';
import { useMessageHandler } from '../../utils/handleSubmit';
import createPayload from '~/utils/createPayload';

import store from '~/store';

export default function MessageHandler({ messages }) {
  const [submission, setSubmission] = useRecoilState(store.submission);
  const [isSubmitting, setIsSubmitting] = useRecoilState(store.isSubmitting);
  const setMessages = useSetRecoilState(store.messages);
  const setConversation = useSetRecoilState(store.conversation);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);

  const { refreshConversations } = store.useConversations();

  const messageHandler = (data, submission) => {
    const { messages, message, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate)
      setMessages([
        ...messages,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.overrideParentMessageId,
          messageId: message?.overrideParentMessageId + '_',
          submitting: true
        }
      ]);
    else
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.messageId,
          messageId: message?.messageId + '_',
          submitting: true
        }
      ]);
  };

  const cancelHandler = (data, submission) => {
    const { messages, message, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate)
      setMessages([
        ...messages,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.overrideParentMessageId,
          messageId: message?.overrideParentMessageId + '_',
          cancelled: true
        }
      ]);
    else
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.messageId,
          messageId: message?.messageId + '_',
          cancelled: true
        }
      ]);
  };

  const createdHandler = (data, submission) => {
    const { messages, message, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate)
      setMessages([
        ...messages,
        {
          ...initialResponse,
          parentMessageId: message?.overrideParentMessageId,
          messageId: message?.overrideParentMessageId + '_',
          submitting: true
        }
      ]);
    else
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          parentMessageId: message?.messageId,
          messageId: message?.messageId + '_',
          submitting: true
        }
      ]);

    const { conversationId } = message;
    setConversation(prevState => ({
      ...prevState,
      conversationId
    }));
    resetLatestMessage();
  };

  const finalHandler = (data, submission) => {
    const { conversation, messages, message, initialResponse, isRegenerate = false } = submission;

    const { requestMessage, responseMessage } = data;
    const { conversationId } = requestMessage;

    // update the messages
    if (isRegenerate) setMessages([...messages, responseMessage]);
    else setMessages([...messages, requestMessage, responseMessage]);
    setIsSubmitting(false);

    // refresh title
    if (requestMessage.parentMessageId == '00000000-0000-0000-0000-000000000000') {
      setTimeout(() => {
        refreshConversations();
      }, 2000);

      // in case it takes too long.
      setTimeout(() => {
        refreshConversations();
      }, 5000);
    }

    const { model, chatGptLabel, promptPrefix } = conversation;
    const isBing = model === 'bingai' || model === 'sydney';

    if (!isBing) {
      const { title } = data;
      const { conversationId } = responseMessage;
      setConversation(prevState => ({
        ...prevState,
        title,
        conversationId,
        jailbreakConversationId: null,
        conversationSignature: null,
        clientId: null,
        invocationId: null,
        chatGptLabel,
        promptPrefix,
        latestMessage: null
      }));
    } else if (model === 'bingai') {
      const { title } = data;
      const { conversationSignature, clientId, conversationId, invocationId } = responseMessage;
      setConversation(prevState => ({
        ...prevState,
        title,
        conversationId,
        jailbreakConversationId: null,
        conversationSignature,
        clientId,
        invocationId,
        chatGptLabel,
        promptPrefix,
        latestMessage: null
      }));
    } else if (model === 'sydney') {
      const { title } = data;
      const {
        jailbreakConversationId,
        parentMessageId,
        conversationSignature,
        clientId,
        conversationId,
        invocationId
      } = responseMessage;
      setConversation(prevState => ({
        ...prevState,
        title,
        conversationId,
        jailbreakConversationId,
        conversationSignature,
        clientId,
        invocationId,
        chatGptLabel,
        promptPrefix,
        latestMessage: null
      }));
    }
  };

  const errorHandler = (data, submission) => {
    const { conversation, messages, message, initialResponse, isRegenerate = false } = submission;

    console.log('Error:', data);
    const errorResponse = {
      ...data,
      error: true,
      parentMessageId: message?.messageId
    };
    setIsSubmitting(false);
    setMessages([...messages, message, errorResponse]);
    return;
  };

  useEffect(() => {
    if (submission === null) return;
    if (Object.keys(submission).length === 0) return;

    const { messages, initialResponse, isRegenerate = false } = submission;
    let { message } = submission;

    const { server, payload } = createPayload(submission);

    const events = new SSE(server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    let latestResponseText = '';
    events.onmessage = e => {
      const data = JSON.parse(e.data);

      if (data.final) {
        finalHandler(data, { ...submission, message });
        console.log('final', data);
      }
      if (data.created) {
        message = {
          ...data.message,
          model: message?.model,
          chatGptLabel: message?.chatGptLabel,
          promptPrefix: message?.promptPrefix,
          overrideParentMessageId: message?.overrideParentMessageId
        };
        createdHandler(data, { ...submission, message });
        console.log('created', message);
      } else {
        let text = data.text || data.response;
        if (data.initial) console.log(data);

        if (data.message) {
          latestResponseText = text;
          messageHandler(text, { ...submission, message });
        }
        // console.log('dataStream', data);
      }
    };

    events.onopen = () => console.log('connection is opened');

    events.oncancel = e => cancelHandler(latestResponseText, { ...submission, message });

    events.onerror = function (e) {
      console.log('error in opening conn.');
      events.close();

      const data = JSON.parse(e.data);

      errorHandler(data, { ...submission, message });
    };

    setIsSubmitting(true);
    events.stream();

    return () => {
      const isCancelled = events.readyState <= 1;
      events.close();
      if (isCancelled) {
        const e = new Event('cancel');
        events.dispatchEvent(e);
      }
      setIsSubmitting(false);
    };
  }, [submission]);

  return null;
}
