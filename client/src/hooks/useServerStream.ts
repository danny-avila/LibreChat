import { useEffect } from 'react';
import { useResetRecoilState, useSetRecoilState } from 'recoil';
import { SSE, createPayload, tMessageSchema, tConversationSchema } from 'librechat-data-provider';
import type { TResPlugin, TMessage, TConversation, TSubmission } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

type TResData = {
  plugin: TResPlugin;
  final?: boolean;
  initial?: boolean;
  requestMessage: TMessage;
  responseMessage: TMessage;
  conversation: TConversation;
};

export default function useServerStream(submission: TSubmission | null) {
  const setMessages = useSetRecoilState(store.messages);
  const setIsSubmitting = useSetRecoilState(store.isSubmitting);
  const setConversation = useSetRecoilState(store.conversation);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);
  const { token } = useAuthContext();

  const { refreshConversations } = store.useConversations();

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
          submitting: true,
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
          submitting: true,
          // unfinished: true
        },
      ]);
    }
  };

  const cancelHandler = (data: TResData, submission: TSubmission) => {
    const { requestMessage, responseMessage, conversation } = data;
    const { messages, isRegenerate = false } = submission;

    // update the messages
    if (isRegenerate) {
      setMessages([...messages, responseMessage]);
    } else {
      setMessages([...messages, requestMessage, responseMessage]);
    }
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

    setConversation((prevState) => ({
      ...prevState,
      ...conversation,
    }));
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
          submitting: true,
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
          submitting: true,
        },
      ]);
    }

    const { conversationId } = message;
    setConversation((prevState) =>
      tConversationSchema.parse({
        ...prevState,
        conversationId,
      }),
    );
    resetLatestMessage();
  };

  const finalHandler = (data: TResData, submission: TSubmission) => {
    const { requestMessage, responseMessage, conversation } = data;
    const { messages, isRegenerate = false } = submission;

    // update the messages
    if (isRegenerate) {
      setMessages([...messages, responseMessage]);
    } else {
      setMessages([...messages, requestMessage, responseMessage]);
    }
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

    setConversation((prevState) => ({
      ...prevState,
      ...conversation,
    }));
  };

  const errorHandler = (data: TResData, submission: TSubmission) => {
    const { messages, message } = submission;

    console.log('Error:', data);
    const errorResponse = tMessageSchema.parse({
      ...data,
      error: true,
      parentMessageId: message?.messageId,
    });
    setIsSubmitting(false);
    setMessages([...messages, message, errorResponse]);
    return;
  };

  const abortConversation = (conversationId = '', submission: TSubmission) => {
    console.log(submission);
    const { endpoint } = submission?.conversation || {};

    fetch(`/api/ask/${endpoint}/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        abortKey: conversationId,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log('aborted', data);
        cancelHandler(data, submission);
      })
      .catch((error) => {
        console.error('Error aborting request');
        console.error(error);
        // errorHandler({ text: 'Error aborting request' }, { ...submission, message });
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

    const { server, payload } = createPayload(submission);

    const events = new SSE(server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    events.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data);

      if (data.final) {
        const { plugins } = data;
        finalHandler(data, { ...submission, plugins, message });
        console.log('final', data);
      }
      if (data.created) {
        message = {
          ...data.message,
          overrideParentMessageId: message?.overrideParentMessageId,
        };
        createdHandler(data, { ...submission, message });
        console.log('created', message);
      } else {
        const text = data.text || data.response;
        const { initial, plugin, plugins } = data;
        if (initial) {
          console.log(data);
        }

        if (data.message) {
          messageHandler(text, { ...submission, plugin, plugins, message });
        }
      }
    };

    events.onopen = () => console.log('connection is opened');

    events.oncancel = () =>
      abortConversation(message?.conversationId ?? submission?.conversationId, submission);

    events.onerror = function (e: MessageEvent) {
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
      // setSource(null);
      if (isCancelled) {
        const e = new Event('cancel');
        events.dispatchEvent(e);
      }
      setIsSubmitting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);
}
