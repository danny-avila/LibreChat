import React, { useEffect, useRef, useState } from 'react';
import { SSE } from '~/utils/sse';
import axios from 'axios';
import SubmitButton from './SubmitButton';
import Regenerate from './Regenerate';
import ModelMenu from '../Models/ModelMenu';
import Footer from './Footer';
import TextareaAutosize from 'react-textarea-autosize';
import handleSubmit from '~/utils/handleSubmit';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation, setError, refreshConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState, setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';
import manualSWR from '~/utils/fetchers';

export default function TextChat({ messages }) {
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null)
  const isComposing = useRef(false);
  const dispatch = useDispatch();
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { isSubmitting, stopStream, submission, disabled, model, chatGptLabel, promptPrefix } =
    useSelector((state) => state.submit);
  const { text } = useSelector((state) => state.text);
  const { error } = convo;
  const genTitle = manualSWR(`/api/convos/gen_title`, 'post');

  // auto focus to input, when enter a conversation.
  useEffect(() => {
    inputRef.current?.focus();
  }, [convo?.conversationId, ])

  const messageHandler = (data, currentState, currentMsg) => {
    const { messages, _currentMsg, message, sender } = currentState;

    dispatch(setMessages([...messages, currentMsg, { sender, text: data, parentMessageId: currentMsg?.messageId, messageId: currentMsg?.messageId + '_', submitting: true }]));
  };

  const createdHandler = (data, currentState, currentMsg) => {
    const { conversationId } = currentMsg;
    dispatch(
      setConversation({
        conversationId,
      })
    );
  };

  const convoHandler = (data, currentState, currentMsg) => {
    const { requestMessage, responseMessage } = data;
    const { conversationId } = currentMsg;
    const { messages, _currentMsg, message, isCustomModel, sender } =
      currentState;
    const { model, chatGptLabel, promptPrefix } = message;
    dispatch(
      setMessages([...messages, requestMessage, responseMessage,])
    );

    const isBing = model === 'bingai' || model === 'sydney';

    if (requestMessage.parentMessageId == '00000000-0000-0000-0000-000000000000') {
      setTimeout(() => {
        dispatch(refreshConversation());
      }, 2000);

      // in case it takes too long.
      setTimeout(() => {
          dispatch(refreshConversation());
      }, 5000);
    }

    if (!isBing && convo.conversationId === null && convo.parentMessageId === null) {
      const { title } = data;
      const { conversationId, messageId } = responseMessage;
      dispatch(
        setConversation({
          title,
          conversationId,
          parentMessageId: messageId,
          jailbreakConversationId: null,
          conversationSignature: null,
          clientId: null,
          invocationId: null,
          chatGptLabel: model === isCustomModel ? chatGptLabel : null,
          promptPrefix: model === isCustomModel ? promptPrefix : null
        })
      );
    } else if (
      model === 'bingai' &&
      convo.conversationId === null &&
      convo.invocationId === null
    ) {
      console.log('Bing data:', data);
      const { title } = data;
      const { conversationSignature, clientId, conversationId, invocationId } = responseMessage;
      dispatch(
        setConversation({
          title,
          parentMessageId: null,
          conversationSignature,
          clientId,
          conversationId,
          invocationId
        })
      );
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
      dispatch(
        setConversation({
          title,
          jailbreakConversationId,
          parentMessageId,
          conversationSignature,
          clientId,
          conversationId,
          invocationId
        })
      );
    }

    dispatch(setSubmitState(false));
  };

  const errorHandler = (data, currentState, currentMsg) => {
    const { initialResponse, messages, _currentMsg, message } = currentState;
    console.log('Error:', data);
    const errorResponse = {
      ...data,
      error: true,
      parentMessageId: currentMsg?.messageId,
    };
    setErrorMessage(data?.text);
    dispatch(setSubmitState(false));
    dispatch(setMessages([...messages, currentMsg, errorResponse]));
    dispatch(setText(message?.text));
    dispatch(setError(true));
    return;
  };

  const submitMessage = () => {
    if (error) {
      dispatch(setError(false));
    }

    if (!!isSubmitting || text.trim() === '') {
      return;
    }

    // this is not a real messageId, it is used as placeholder before real messageId returned
    const fakeMessageId = crypto.randomUUID();
    const isCustomModel = model === 'chatgptCustom' || !initial[model];
    const message = text.trim();
    const currentMsg = { sender: 'User', text: message, current: true, isCreatedByUser: true, parentMessageId: convo.parentMessageId || '00000000-0000-0000-0000-000000000000', messageId: fakeMessageId };
    const sender = model === 'chatgptCustom' ? chatGptLabel : model;
    const initialResponse = { sender, text: '', parentMessageId: fakeMessageId, submitting: true };

    dispatch(setSubmitState(true));
    dispatch(setMessages([...messages, currentMsg, initialResponse]));
    dispatch(setText(''));

    const submission = {
      convo,
      isCustomModel,
      message: { 
        ...currentMsg,
        model,
        chatGptLabel,
        promptPrefix,
      },
      messages,
      currentMsg,
      initialResponse,
      sender,
    };
    console.log('User Input:', message);
    // handleSubmit(submission);
    dispatch(setSubmission(submission));
  };

  const createPayload = ({ convo, message }) => {
    const endpoint = `/api/ask`;
    let payload = { ...message };
    const { model } = message

    if (!payload.conversationId)
      if (convo?.conversationId && convo?.parentMessageId) {
        payload = {
          ...payload,
          conversationId: convo.conversationId,
          parentMessageId: convo.parentMessageId || '00000000-0000-0000-0000-000000000000'
        };
      }

    const isBing = model === 'bingai' || model === 'sydney';
    if (isBing && convo?.conversationId) {
      payload = {
        ...payload,
        jailbreakConversationId: convo.jailbreakConversationId,
        conversationId: convo.conversationId,
        conversationSignature: convo.conversationSignature,
        clientId: convo.clientId,
        invocationId: convo.invocationId
      };
    }

    let server = endpoint;
    server = model === 'bingai' ? server + '/bing' : server;
    server = model === 'sydney' ? server + '/sydney' : server;
    return { server, payload };
  };

  useEffect(() => {
    if (Object.keys(submission).length === 0) {
      return;
    }

    const currentState = submission;
    let currentMsg = currentState.currentMsg;
    const { server, payload } = createPayload(submission);
    const onMessage = (e) => {
      if (stopStream) {
        return;
      }

      const data = JSON.parse(e.data);

      // if (data.message) {
      //   messageHandler(text, currentState);
      // }

      if (data.final) {
        convoHandler(data, currentState, currentMsg);
        console.log('final', data);
      } if (data.created) {
        currentMsg = data.message;
        createdHandler(data, currentState, currentMsg);
      } else {
        let text = data.text || data.response;
        if (data.message) {
          messageHandler(text, currentState, currentMsg);
        }
        // console.log('dataStream', data);
      }
    };

    const events = new SSE(server, {
      payload: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    events.onopen = function () {
      console.log('connection is opened');
    };

    events.onmessage = onMessage;

    events.onerror = function (e) {
      console.log('error in opening conn.');
      events.close();

      const data = JSON.parse(e.data);

      errorHandler(data, currentState, currentMsg);
    };

    events.stream();

    return () => {
      events.removeEventListener('message', onMessage);
      events.close();
    };
  }, [submission]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isComposing.current)
        submitMessage();
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      return console.log('Enter + Shift');
    }

    if (isSubmitting) {
      return;
    }
  };
  
  const handleCompositionStart = (e) => {
    isComposing.current = true
  }

  const handleCompositionEnd = (e) => {
    isComposing.current = false;
  }

  const changeHandler = (e) => {
    const { value } = e.target;

    if (isSubmitting && (value === '' || value === '\n')) {
      return;
    }
    dispatch(setText(value));
  };

  const tryAgain = (e) => {
    e.preventDefault();
    dispatch(setError(false));
  };

  return (
    <div className="md:bg-vert-light-gradient dark:md:bg-vert-dark-gradient absolute bottom-0 left-0 w-full border-t bg-white dark:border-white/20 dark:bg-gray-800 md:border-t-0 md:border-transparent md:!bg-transparent md:dark:border-transparent">
      <form className="stretch mx-2 flex flex-row gap-3 pt-2 last:mb-2 md:last:mb-6 lg:mx-auto lg:max-w-3xl lg:pt-6">
        <div className="relative flex h-full flex-1 md:flex-col">
          <div className="ml-1 mt-1.5 flex justify-center gap-0 md:m-auto md:mb-2 md:w-full md:gap-2" />
          {error ? (
            <Regenerate
              submitMessage={submitMessage}
              tryAgain={tryAgain}
              errorMessage={errorMessage}
            />
          ) : (
            <div
              className={`relative flex w-full flex-grow flex-col rounded-md border border-black/10 ${
                disabled ? 'bg-gray-100' : 'bg-white'
              } py-2 shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:border-gray-900/50 ${
                disabled ? 'dark:bg-gray-900' : 'dark:bg-gray-700'
              } dark:text-white dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] md:py-3 md:pl-4`}
            >
              <ModelMenu />
              <TextareaAutosize
                tabIndex="0"
                autoFocus
                ref={inputRef}
                // style={{maxHeight: '200px', height: '24px', overflowY: 'hidden'}}
                rows="1"
                value={text}
                onKeyUp={handleKeyUp}
                onKeyDown={handleKeyDown}
                onChange={changeHandler}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                placeholder={disabled ? 'Choose another model or customize GPT again' : ''}
                disabled={disabled}
                className="m-0 h-auto max-h-52 resize-none overflow-auto border-0 bg-transparent p-0 pl-9 pr-8 leading-6 focus:outline-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:pl-8"
              />
              <SubmitButton submitMessage={submitMessage} />
            </div>
          )}
        </div>
      </form>
      <Footer />
    </div>
  );
}
