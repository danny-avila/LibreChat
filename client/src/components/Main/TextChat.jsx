import React, { useEffect, useRef, useState } from 'react';
import { SSE } from '~/utils/sse';
import SubmitButton from './SubmitButton';
import Regenerate from './Regenerate';
import ModelMenu from '../Models/ModelMenu';
import Footer from './Footer';
import TextareaAutosize from 'react-textarea-autosize';
import createPayload from '~/utils/createPayload';
import resetConvo from '~/utils/resetConvo';
import RegenerateIcon from '../svg/RegenerateIcon';
import StopGeneratingIcon from '../svg/StopGeneratingIcon';
import { useSelector, useDispatch } from 'react-redux';
import {
  setConversation,
  setNewConvo,
  setError,
  refreshConversation
} from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState, setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';
import { useMessageHandler } from '../../utils/handleSubmit';

export default function TextChat({ messages }) {
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);
  const isComposing = useRef(false);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.user);
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { isSubmitting, stopStream, submission, disabled, model, chatGptLabel, promptPrefix } =
    useSelector((state) => state.submit);
  const { text } = useSelector((state) => state.text);
  const { error, latestMessage } = convo;
  const { ask, regenerate, stopGenerating } = useMessageHandler();

  const isNotAppendable = (!isSubmitting && latestMessage?.submitting) || latestMessage?.error;

  // auto focus to input, when enter a conversation.
  useEffect(() => {
    inputRef.current?.focus();
  }, [convo?.conversationId]);

  const messageHandler = (data, currentState, currentMsg) => {

    const { messages, _currentMsg, message, sender, isRegenerate } = currentState;

    if (isRegenerate)
      dispatch(
        setMessages([
          ...messages,
          {
            sender,
            text: data,
            parentMessageId: message?.overrideParentMessageId,
            messageId: message?.overrideParentMessageId + '_',
            submitting: true
          }
        ])
      );
    else
      dispatch(
        setMessages([
          ...messages,
          currentMsg,
          {
            sender,
            text: data,
            parentMessageId: currentMsg?.messageId,
            messageId: currentMsg?.messageId + '_',
            submitting: true
          }
        ])
      );
  };

  const createdHandler = (data, currentState, currentMsg) => {
    const { conversationId } = currentMsg;
    dispatch(
      setConversation({
        conversationId,
        latestMessage: null
      })
    );
  };

  const convoHandler = (data, currentState, currentMsg) => {
    const { requestMessage, responseMessage } = data;
    const { conversationId } = requestMessage;
    const { messages, _currentMsg, message, isCustomModel, sender, isRegenerate } =
      currentState;
    const { model, chatGptLabel, promptPrefix } = message;
    if (isRegenerate) dispatch(setMessages([...messages, responseMessage]));
    else dispatch(setMessages([...messages, requestMessage, responseMessage]));

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
          promptPrefix: model === isCustomModel ? promptPrefix : null,
          latestMessage: null
        })
      );
    } else if (model === 'bingai') {
      console.log('Bing data:', data);
      const { title } = data;
      const { conversationSignature, clientId, conversationId, invocationId } =
        responseMessage;
      dispatch(
        setConversation({
          title,
          parentMessageId: null,
          conversationSignature,
          clientId,
          conversationId,
          invocationId,
          latestMessage: null
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
          invocationId,
          latestMessage: null
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
      parentMessageId: currentMsg?.messageId
    };
    setErrorMessage(data?.text);
    dispatch(setSubmitState(false));
    dispatch(setMessages([...messages, currentMsg, errorResponse]));
    dispatch(setText(message?.text));
    dispatch(setError(true));
    return;
  };
  const submitMessage = () => {
    ask({ text });
  };

  useEffect(() => {
    inputRef.current?.focus();
    if (Object.keys(submission).length === 0) {
      return;
    }

    const currentState = submission;
    let currentMsg = { ...currentState.message };

    const { server, payload } = createPayload(submission);
    const onMessage = (e) => {
      if (stopStream) {
        return;
      }

      const data = JSON.parse(e.data);

      if (data.final) {
        convoHandler(data, currentState, currentMsg);
        console.log('final', data);
      }
      if (data.created) {
        currentMsg = data.message;
        createdHandler(data, currentState, currentMsg);
      } else {
        let text = data.text || data.response;
        if (data.initial) {
          console.log(data);
        }
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
      dispatch(setSubmitState(false));
      events.removeEventListener('message', onMessage);
      events.close();
    };
  }, [submission]);

  const handleRegenerate = () => {
    if (latestMessage && !latestMessage?.isCreatedByUser) regenerate(latestMessage);
  };

  const handleStopGenerating = () => {
    stopGenerating();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isComposing.current) submitMessage();
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
    isComposing.current = true;
  };

  const handleCompositionEnd = (e) => {
    isComposing.current = false;
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

  const placeholder = () => {
    if (disabled && isSubmitting) {
      return 'Choose another model or customize GPT again';
    } else if (!isSubmitting && latestMessage?.submitting) {
      return 'Message in progress...';
      // } else if (latestMessage?.error) {
      // return 'Error...';
    } else {
      return '';
    }
  };

  return (
    <div className="input-panel md:bg-vert-light-gradient dark:md:bg-vert-dark-gradient absolute bottom-0 left-0 w-full border-t bg-white pt-2 dark:border-white/20 dark:bg-gray-800 md:border-t-0 md:border-transparent md:bg-transparent md:dark:border-transparent">
      <form className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:pt-2 md:last:mb-6 lg:mx-auto lg:max-w-3xl lg:pt-6">
        <div className="relative flex h-full flex-1 md:flex-col">
          <span className="order-last ml-1 flex justify-center gap-0 md:order-none md:m-auto md:mb-2 md:w-full md:gap-2">
            {isSubmitting ? (
              <button
                onClick={handleStopGenerating}
                className="input-panel-button btn btn-neutral flex justify-center gap-2 border-0 md:border"
                type="button"
              >
                <StopGeneratingIcon />
                <span className="hidden md:block">Stop generating</span>
              </button>
            ) : latestMessage && !latestMessage?.isCreatedByUser ? (
              <button
                onClick={handleRegenerate}
                className="input-panel-button btn btn-neutral flex justify-center gap-2 border-0 md:border"
                type="button"
              >
                <RegenerateIcon />
                <span className="hidden md:block">Regenerate response</span>
              </button>
            ) : null}
          </span>
          <div
            className={`relative flex flex-grow flex-col rounded-md border border-black/10 ${
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
              placeholder={placeholder()}
              disabled={disabled || isNotAppendable}
              className="m-0 h-auto max-h-52 resize-none overflow-auto border-0 bg-transparent p-0 pl-12 pr-8 leading-6 placeholder:text-sm focus:outline-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:pl-8"
            />
            <SubmitButton
              submitMessage={submitMessage}
              disabled={disabled || isNotAppendable}
            />
          </div>
        </div>
      </form>
      <Footer />
    </div>
  );
}
