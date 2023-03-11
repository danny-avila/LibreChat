import React, { useState } from 'react';
import SubmitButton from './SubmitButton';
import Regenerate from './Regenerate';
import ModelMenu from '../Models/ModelMenu';
import Footer from './Footer';
import TextareaAutosize from 'react-textarea-autosize';
import handleSubmit from '~/utils/handleSubmit';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation, setError } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';

export default function TextChat({ messages }) {
  const [errorMessage, setErrorMessage] = useState('');
  const dispatch = useDispatch();
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { isSubmitting, stopStream, disabled, model, chatGptLabel, promptPrefix } = useSelector(
    (state) => state.submit
  );
  const { text } = useSelector((state) => state.text);
  const { error } = convo;
  const isCustomModel = model === 'chatgptCustom' || !initial[model];

  const submitMessage = () => {
    if (error) {
      dispatch(setError(false));
    }

    if (!!isSubmitting || text.trim() === '') {
      return;
    }
    dispatch(setSubmitState(true));
    const message = text.trim();
    const currentMsg = { sender: 'User', text: message, current: true };
    const sender = model === 'chatgptCustom' ? chatGptLabel : model;
    const initialResponse = { sender, text: '' };
    dispatch(setMessages([...messages, currentMsg, initialResponse]));
    dispatch(setText(''));
    const messageHandler = (data, events) => {
      if (stopStream) {
        console.log('Stopping stream');
        events.close();
        return;
      }
      dispatch(setMessages([...messages, currentMsg, { sender, text: data }]));
    };
    const convoHandler = (data) => {
      dispatch(
        setMessages([...messages, currentMsg, { sender, text: data.text || data.response }])
      );

      const isBing = model === 'bingai' || model === 'sydney';

      if (
        !isBing &&
        convo.conversationId === null &&
        convo.parentMessageId === null
      ) {
        const { title, conversationId, id } = data;
        dispatch(
          setConversation({
            title,
            conversationId,
            parentMessageId: id,
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
        console.log('Bing data:', data)
        const {
          title,
          conversationSignature,
          clientId,
          conversationId,
          invocationId
        } = data;
        dispatch(
          setConversation({
            title,
            parentMessageId: null,
            conversationSignature,
            clientId,
            conversationId,
            invocationId,
          })
        );
      } else if (model === 'sydney') {
        const {
          title,
          jailbreakConversationId,
          parentMessageId,
          conversationSignature,
          clientId,
          conversationId,
          invocationId
        } = data;
        dispatch(
          setConversation({
            title,
            jailbreakConversationId,
            parentMessageId,
            conversationSignature,
            clientId,
            conversationId,
            invocationId,
          })
        );
      }

      dispatch(setSubmitState(false));
    };

    const errorHandler = (event) => {
      console.log('Error:', event);
      const errorResponse = {
        ...initialResponse,
        text: `An error occurred. Please try again in a few moments.\n\nError message: ${event.data}`,
        error: true
      };
      setErrorMessage(event.data);
      dispatch(setSubmitState(false));
      dispatch(setMessages([...messages.slice(0, -2), currentMsg, errorResponse]));
      dispatch(setText(message));
      dispatch(setError(true));
      return;
    };
    const submission = {
      model,
      text: message,
      convo,
      messageHandler,
      convoHandler,
      errorHandler,
      chatGptLabel,
      promptPrefix
    };
    console.log('User Input:', message);
    handleSubmit(submission);
  };

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
