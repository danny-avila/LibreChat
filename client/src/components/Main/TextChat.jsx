import React, { useEffect, useRef, useState } from 'react';
import { SSE } from '~/utils/sse';
import SubmitButton from './SubmitButton';
import Regenerate from './Regenerate';
import ModelMenu from '../Models/ModelMenu';
import Footer from './Footer';
import TextareaAutosize from 'react-textarea-autosize';
import handleSubmit from '~/utils/handleSubmit';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation, setError } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState, setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';

export default function TextChat({ messages }) {
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null)
  const dispatch = useDispatch();
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { isSubmitting, stopStream, submission, disabled, model, chatGptLabel, promptPrefix } =
    useSelector((state) => state.submit);
  const { text } = useSelector((state) => state.text);
  const { error } = convo;

  // auto focus to input, when enter a conversation.
  useEffect(() => {
    inputRef.current?.focus();
  }, [convo?.conversationId, ])

  const messageHandler = (data, currentState, currentMsg) => {
    const { messages, _currentMsg, message, sender } = currentState;

    dispatch(setMessages([...messages, currentMsg, { sender, text: data }]));
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
    const { messages, _currentMsg, message, isCustomModel, sender } =
      currentState;
    const { model, chatGptLabel, promptPrefix } = message;
    dispatch(
      setMessages([...messages, 
        { 
          ...requestMessage, 
          // messageId: data?.parentMessageId,  
        }, 
        { 
          ...responseMessage,
          // sender, 
          // text: data.text || data.response, 
        }
      ])
    );

    const isBing = model === 'bingai' || model === 'sydney';

    // if (!message.messageId)

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

  const errorHandler = (event, currentState) => {
    const { initialResponse, messages, currentMsg, message } = currentState;
    console.log('Error:', event);
    const errorResponse = {
      ...initialResponse,
      text: `An error occurred. Please try again in a few moments.\n\nError message: ${event.data}`,
      error: true
    };
    setErrorMessage(event.data);
    dispatch(setSubmitState(false));
    dispatch(setMessages([...messages.slice(0, -2), currentMsg, errorResponse]));
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

    const isCustomModel = model === 'chatgptCustom' || !initial[model];
    const message = text.trim();
    const currentMsg = { sender: 'User', text: message, current: true, isCreatedByUser: true };
    const sender = model === 'chatgptCustom' ? chatGptLabel : model;
    const initialResponse = { sender, text: '' };

    dispatch(setSubmitState(true));
    dispatch(setMessages([...messages, currentMsg, initialResponse]));
    dispatch(setText(''));

    const submission = {
      convo,
      isCustomModel,
      message: { 
        sender: 'User',
        text: message, 
        isCreatedByUser: true,
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
          parentMessageId: convo.parentMessageId
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
      errorHandler(e, currentState);
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
  };

  const handleKeyUp = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      return console.log('Enter + Shift');
    }

    if (isSubmitting) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      submitMessage();
    }
  };

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
