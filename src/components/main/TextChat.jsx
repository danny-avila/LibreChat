import React, { useState } from 'react';
import SubmitButton from './SubmitButton';
import TextareaAutosize from 'react-textarea-autosize';
import handleSubmit from '~/utils/handleSubmit';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState } from '~/store/submitSlice';

export default function TextChat({ messages, reloadConvos }) {
  const [text, setText] = useState('');
  const dispatch = useDispatch();
  const convo = useSelector((state) => state.convo);
  const { isSubmitting } = useSelector((state) => state.submit);

  const submitMessage = () => {
    if (!!isSubmitting || text.trim() === '') {
      return;
    }
    dispatch(setSubmitState(true));
    const payload = text.trim();
    const currentMsg = { sender: 'user', text: payload, current: true };
    const initialResponse = { sender: 'GPT', text: '' };
    dispatch(setMessages([...messages, currentMsg, initialResponse]));
    setText('');
    const messageHandler = (data) => {
      dispatch(setMessages([...messages, currentMsg, { sender: 'GPT', text: data }]));
    };
    const convoHandler = (data) => {
      if (convo.conversationId === null && convo.parentMessageId === null) {
        const { conversationId, parentMessageId } = data;
        dispatch(setConversation({ conversationId, parentMessageId: data.id }));
      }

      reloadConvos();
      dispatch(setSubmitState(false));
    };
    console.log('User Input:', payload);
    handleSubmit(payload, messageHandler, convo, convoHandler);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('Enter + Shift');
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (!!isSubmitting) {
        return;
      }
      submitMessage();
    }
  };

  const changeHandler = (e) => {
    // console.log('changeHandler', JSON.stringify(e.target.value));
    const { value } = e.target;
    if (isSubmitting && (value === '' || value === '\n')) {
      return;
    }
    setText(value);
  };

  return (
    <div className="md:bg-vert-light-gradient dark:md:bg-vert-dark-gradient w-full border-t bg-white dark:border-white/20 dark:bg-gray-800 md:border-t-0 md:border-transparent md:!bg-transparent md:dark:border-transparent">
      <form className="stretch mx-2 flex flex-row gap-3 pt-2 last:mb-2 md:last:mb-6 lg:mx-auto lg:max-w-3xl lg:pt-6">
        <div className="relative flex h-full flex-1 md:flex-col">
          <div className="ml-1 mt-1.5 flex justify-center gap-0 md:m-auto md:mb-2 md:w-full md:gap-2" />
          <div className="relative flex w-full flex-grow flex-col rounded-md border border-black/10 bg-white py-2 shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:border-gray-900/50 dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] md:py-3 md:pl-4">
            <TextareaAutosize
              tabIndex="0"
              // style={{maxHeight: '200px', height: '24px', overflowY: 'hidden'}}
              rows="1"
              value={text}
              onKeyUp={handleKeyPress}
              onChange={changeHandler}
              placeholder=""
              className="m-0 h-auto max-h-52 resize-none overflow-auto border-0 bg-transparent p-0 pl-2 pr-7 leading-6 focus:outline-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:pl-0"
            />
            <SubmitButton submitMessage={submitMessage} />
          </div>
        </div>
      </form>
      <div className="px-3 pt-2 pb-3 text-center text-xs text-black/50 dark:text-white/50 md:px-4 md:pt-3 md:pb-6">
        <a
          href="https://help.openai.com/en/articles/6825453-chatgpt-release-notes"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          ChatGPT Jan 30 Version
        </a>
        . Free Research Preview. Our goal is to make AI systems more natural and safe to
        interact with. Your feedback will help us improve.
      </div>
    </div>
  );
}
