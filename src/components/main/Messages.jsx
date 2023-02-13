import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import useDidMountEffect from '~/hooks/useDidMountEffect';
import Message from './Message';
import Landing from './Landing';

export default function Messages({ title, messages }) {
  if (messages.length === 0) {
    return <Landing title={title}/>;
  }

  useDocumentTitle(title);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // this useEffect triggers the following warning:
  // Warning: Internal React error: Expected static flag was missing.
  // useEffect(() => {
  //   scrollToBottom();
  // }, [messages]);

  useDidMountEffect(() => scrollToBottom(), [messages]);

  return (
    <div className="flex-1 overflow-y-auto ">
      {/* <div className="flex-1 overflow-hidden"> */}
        <div className="h-full dark:bg-gray-800">
          <div className="flex h-full flex-col items-center text-sm dark:bg-gray-800">
            {messages.map((message, i) => (
              <Message
                key={i}
                sender={message.sender}
                text={message.text}
                last={i === messages.length - 1}
                error={!!message.error ? true : false}
              />
            ))}
            <div
              className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:bg-gray-800 md:h-48"
              ref={messagesEndRef}
            />
          </div>
        </div>
      {/* </div> */}
    </div>
  );
}
