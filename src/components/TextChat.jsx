import React, { useState } from 'react';
import { SSE } from '../../app/sse';
import TextareaAutosize from 'react-textarea-autosize';

const handleSubmit = (text, messageHandler, convo, convoHandler) => {
  let payload = { text };
  if (convo.conversationId && convo.parentMessageId) {
    payload = {
      ...payload,
      conversationId: convo.conversationId,
      parentMessageId: convo.parentMessageId
    };
  }

  const events = new SSE('http://localhost:3050/ask', {
    payload: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  events.onopen = function () {
    console.log('connection is opened');
  };

  events.onmessage = function (e) {
    const data = JSON.parse(e.data);
    if (!!data.message) {
      messageHandler(data.text.replace(/^\n/, ''));
    } else {
      console.log(data);
      convoHandler(data);
    }
  };

  events.onerror = function (e) {
    console.log(e, 'error in opening conn.');
    events.close();
  };

  events.stream();
};

export default function TextChat({ messages, setMessages, conversation = null }) {
  const [text, setText] = useState('');
  const [convo, setConvo] = useState({ conversationId: null, parentMessageId: null });

  if (!!conversation) {
    setConvo(conversation);
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      console.log('Enter + Shift');
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const payload = text.trim();
      const currentMsg = { sender: 'user', text: payload, current: true };
      setMessages([...messages, currentMsg]);
      setText('');
      const messageHandler = (data) => {
        setMessages([...messages, currentMsg, { sender: 'GPT', text: data }]);
      };
      const convoHandler = (data) => {
        if (convo.conversationId === null && convo.parentMessageId === null) {
          const { conversationId, parentMessageId } = data;
          setConvo({ conversationId, parentMessageId: data.id });
        }
      };
      console.log('User Input:', payload);
      handleSubmit(payload, messageHandler, convo, convoHandler);
    }
  };

  // <>
  //   <textarea
  //     className="m-10 h-16 p-4"
  //     value={text}
  //     onKeyUp={handleKeyPress}
  //     onChange={(e) => setText(e.target.value)}
  //   />
  // </>
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
              onChange={(e) => setText(e.target.value)}
              placeholder=""
              className="m-0 h-auto resize-none overflow-auto border-0 bg-transparent p-0 pl-2 pr-7 leading-6 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:pl-0"
            />
            <button className="absolute bottom-1.5 right-1 rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:hover:bg-transparent dark:hover:bg-gray-900 dark:hover:text-gray-400 dark:disabled:hover:bg-transparent md:bottom-2.5 md:right-2">
              <svg
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1 h-4 w-4"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line
                  x1="22"
                  y1="2"
                  x2="11"
                  y2="13"
                />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
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
