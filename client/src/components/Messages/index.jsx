import React, { useEffect, useState, useRef, useMemo } from 'react';
import Spinner from '../svg/Spinner';
import { CSSTransition } from 'react-transition-group';
import ScrollToBottom from './ScrollToBottom';
import MultiMessage from './MultiMessage';
import { useSelector } from 'react-redux';

const Messages = ({ messages, messageTree }) => {
  const [currentEditId, setCurrentEditId] = useState(-1);
  const { conversationId } = useSelector((state) => state.convo);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const scrollable = scrollableRef.current;
      const hasScrollbar = scrollable.scrollHeight > scrollable.clientHeight;
      setShowScrollButton(hasScrollbar);
    }, 650);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const diff = Math.abs(scrollHeight - scrollTop);
    const bottom =
      diff === clientHeight || (diff <= clientHeight + 25 && diff >= clientHeight - 25);
    if (bottom) {
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  };

  let timeoutId = null;
  const debouncedHandleScroll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleScroll, 100);
  };

  const scrollHandler = (e) => {
    e.preventDefault();
    scrollToBottom();
  };

  return (
    <div
      className="flex-1 overflow-y-auto "
      ref={scrollableRef}
      onScroll={debouncedHandleScroll}
    >
      {/* <div className="flex-1 overflow-hidden"> */}
      <div className="dark:gpt-dark-gray h-full">
        <div className="dark:gpt-dark-gray flex h-full flex-col items-center text-sm">
          {messageTree.length === 0 ? (
            <Spinner />
          ) : (
            <>
              <MultiMessage
                key={conversationId} // avoid internal state mixture
                messageList={messageTree}
                messages={messages}
                scrollToBottom={scrollToBottom}
                currentEditId={currentEditId}
                setCurrentEditId={setCurrentEditId}
              />
              <CSSTransition
                in={showScrollButton}
                timeout={400}
                classNames="scroll-down"
                unmountOnExit={false}
                // appear
              >
                {() => showScrollButton && <ScrollToBottom scrollHandler={scrollHandler} />}
              </CSSTransition>
            </>
          )}
          <div
            className="dark:gpt-dark-gray group h-32 w-full flex-shrink-0 dark:border-gray-900/50 md:h-48"
            ref={messagesEndRef}
          />
        </div>
      </div>
      {/* </div> */}
    </div>
  );
};

export default Messages;
