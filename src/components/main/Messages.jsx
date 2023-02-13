import React, { useEffect, useState, useRef } from 'react';
import useDidMountEffect from '~/hooks/useDidMountEffect';
import Message from './Message';
import ScrollToBottom from './ScrollToBottom';

const Messages = ({ messages }) => {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef(null);
  const messagesEndRef = useRef(null);


  useEffect(() => {
    const scrollable = scrollableRef.current;
    const hasScrollbar = scrollable.scrollHeight > scrollable.clientHeight;
    setShowScrollButton(hasScrollbar);
  }, [scrollableRef]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop === e.target.clientHeight;
    if (bottom) {
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  };

  const scrollHandler = (e) => {
    e.preventDefault();
    scrollToBottom();
  };

  return (
    <div
      className="flex-1 overflow-y-auto "
      ref={scrollableRef}
      onScroll={handleScroll}
    >
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
          {showScrollButton && <ScrollToBottom scrollHandler={scrollHandler} />}
          <div
            className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:bg-gray-800 md:h-48"
            ref={messagesEndRef}
          />
        </div>
      </div>
      {/* </div> */}
    </div>
  );
};

export default Messages
