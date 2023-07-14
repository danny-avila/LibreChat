import { useEffect } from 'react';
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil';
import { SSE, createPayload } from '@librechat/data-provider';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';

export default function MessageHandler() {
  const submission = useRecoilValue(store.submission);
  const setIsSubmitting = useSetRecoilState(store.isSubmitting);
  const setMessages = useSetRecoilState(store.messages);
  const setConversation = useSetRecoilState(store.conversation);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);
  const { token } = useAuthContext();

  const { refreshConversations } = store.useConversations();

  const messageHandler = (data, submission) => {
    const { messages, message, plugin, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate) {
      setMessages([
        ...messages,
        {
          ...initialResponse,
          text: data,
          parentMessageId: message?.overrideParentMessageId,
          messageId: message?.overrideParentMessageId + '_',
          plugin: plugin ? plugin : null,
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
          plugin: plugin ? plugin : null,
          submitting: true,
          // unfinished: true
        },
      ]);
    }
  };

  const cancelHandler = (data, submission) => {
    const { messages, isRegenerate = false } = submission;

    const { requestMessage, responseMessage, conversation } = data;

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

  const createdHandler = (data, submission) => {
    const { messages, message, initialResponse, isRegenerate = false } = submission;

    if (isRegenerate)
      setMessages([
        ...messages,
        {
          ...initialResponse,
          parentMessageId: message?.overrideParentMessageId,
          messageId: message?.overrideParentMessageId + '_',
          submitting: true,
        },
      ]);
    else
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

    const { conversationId } = message;
    setConversation((prevState) => ({
      ...prevState,
      conversationId,
    }));
    resetLatestMessage();
  };

  const finalHandler = (data, submission) => {
    const { messages, isRegenerate = false } = submission;

    const { requestMessage, responseMessage, conversation } = data;

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

  const errorHandler = (data, submission) => {
    const { messages, message } = submission;

    console.log('Error:', data);
    const errorResponse = {
      ...data,
      error: true,
      parentMessageId: message?.messageId,
    };
    setIsSubmitting(false);
    setMessages([...messages, message, errorResponse]);
    return;
  };

  const abortConversation = (conversationId) => {
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
    if (submission === null) return;
    if (Object.keys(submission).length === 0) return;

    let { message } = submission;

    const { server, payload } = createPayload(submission);

    const events = new SSE(server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });

    events.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.final) {
        finalHandler(data, { ...submission, message });
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
        let text = data.text || data.response;
        let { initial, plugin } = data;
        if (initial) console.log(data);

        if (data.message) {
          messageHandler(text, { ...submission, plugin, message });
        }
      }
    };

    events.onopen = () => console.log('connection is opened');

    events.oncancel = () =>
      abortConversation(message?.conversationId || submission?.conversationId);

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
      // setSource(null);
      if (isCancelled) {
        const e = new Event('cancel');
        events.dispatchEvent(e);
      }
      setIsSubmitting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission]);

  return null;
}
