import { useEffect, useState } from 'react';
import { useRecoilValue, useRecoilState, useResetRecoilState, useSetRecoilState } from 'recoil';
import { SSE } from '~/data-provider/sse.mjs';
import createPayload from '~/data-provider/createPayload';
import { useAbortRequestWithMessage } from '~/data-provider';
import { v4 } from 'uuid';
import store from '~/store';

export default function MessageHandler() {
  const submission = useRecoilValue(store.submission);
  const setIsSubmitting = useSetRecoilState(store.isSubmitting);
  const setMessages = useSetRecoilState(store.messages);
  const setConversation = useSetRecoilState(store.conversation);
  const resetLatestMessage = useResetRecoilState(store.latestMessage);
  const [lastResponse, setLastResponse] = useRecoilState(store.lastResponse);
  const setLatestMessage = useSetRecoilState(store.latestMessage);
  const setSubmission = useSetRecoilState(store.submission);
  const [source, setSource] = useState(null);
  // const [abortKey, setAbortKey] = useState(null);
  const [currentParent, setCurrentParent] = useState(null);

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
    const { text, messageId, parentMessageId } = data;

    if (isRegenerate) {
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
    } else {
      console.log('cancelHandler, isRegenerate = false');
      setMessages([
        ...messages,
        message,
        {
          ...initialResponse,
          text,
          parentMessageId: message?.messageId,
          messageId,
          // cancelled: true
        }
      ]);
      setLastResponse('');
      setSource(null);
      setIsSubmitting(false);
      setSubmission(null);
      setLatestMessage(data);
    }
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
    const { messages, isRegenerate = false } = submission;

    const { requestMessage, responseMessage, conversation } = data;

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

    setConversation(prevState => ({
      ...prevState,
      ...conversation
    }));
  };

  const errorHandler = (data, submission) => {
    const { messages, message } = submission;

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

    let { message, cancel } = submission;

    if (cancel && source) {
      console.log('message aborted', submission);
      source.close();
      const { endpoint } = submission.conversation;

      // splitting twice because the cursor may or may not be wrapped in a span
      const latestMessageText = lastResponse.split('█')[0].split('<span className="result-streaming">')[0];
      const latestMessage = {
        text: latestMessageText,
        messageId: v4(),
        parentMessageId: currentParent.messageId,
        conversationId: currentParent.conversationId
      };

      fetch(`/api/ask/${endpoint}/abort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          abortKey: currentParent.conversationId,
          latestMessage
        })
      })
        .then(response => {
          if (response.ok) {
            console.log('Request aborted');
          } else {
            console.error('Error aborting request');
          }
        })
        .catch(error => {
          console.error(error);
        });
      console.log('source closed, got this far');
      cancelHandler(latestMessage, { ...submission, message });
      return;
    }

    const { server, payload } = createPayload(submission);

    const events = new SSE(server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    setSource(events);

    // let latestResponseText = '';
    events.onmessage = e => {
      const data = JSON.parse(e.data);

      if (data.final) {
        finalHandler(data, { ...submission, message });
        console.log('final', data);
      }
      if (data.created) {
        message = {
          ...data.message,
          overrideParentMessageId: message?.overrideParentMessageId
        };
        createdHandler(data, { ...submission, message });
        console.log('created', message);
        // setAbortKey(message?.conversationId);
        setCurrentParent(message);
      } else {
        let text = data.text || data.response;
        if (data.initial) console.log(data);

        if (data.message) {
          // latestResponseText = text;
          setLastResponse(text);
          messageHandler(text, { ...submission, message });
        }
        // console.log('dataStream', data);
      }
    };

    events.onopen = () => console.log('connection is opened');

    // events.oncancel = () => cancelHandler(latestResponseText, { ...submission, message });

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
      setSource(null);
      if (isCancelled) {
        const e = new Event('cancel');
        events.dispatchEvent(e);
      }
      setIsSubmitting(false);
    };
  }, [submission]);

  return null;
}
