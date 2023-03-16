import React, { useEffect, useState, useRef, useMemo } from 'react';
import Spinner from '../svg/Spinner';
import { CSSTransition } from 'react-transition-group';
import ScrollToBottom from './ScrollToBottom';
import MultiMessage from './MultiMessage';
import { useSelector } from 'react-redux';

const Messages = ({ messages, messageTree }) => {
  const [currentEditId, setCurrentEditId] = useState(-1);
  const { conversationId } = useSelector((state) => state.convo);
  const { model, customModel, chatGptLabel } = useSelector((state) => state.submit);
  const { models } = useSelector((state) => state.models);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef(null);
  const messagesEndRef = useRef(null);

  const modelName = models.find(element => element.model==model)?.name

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
        <div className="flex w-full items-center justify-center gap-1 border-b border-black/10 bg-gray-50 p-3 text-gray-500 dark:border-gray-900/50 dark:bg-gray-700 dark:text-gray-300 text-sm">
          Model: {modelName} {customModel?`(${customModel})`:null}
        </div>
        <div className="dark:gpt-dark-gray flex flex-col items-center text-sm">
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

export default React.memo(Messages);
