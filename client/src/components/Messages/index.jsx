import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import Spinner from '../svg/Spinner';
import { throttle } from 'lodash';
import { CSSTransition } from 'react-transition-group';
import ScrollToBottom from './ScrollToBottom';
import MultiMessage from './MultiMessage';
import MessageHeader from './MessageHeader';
import { useScreenshot } from '~/utils/screenshotContext.jsx';

import store from '~/store';

export default function Messages({ isSearchView = false }) {
  const [currentEditId, setCurrentEditId] = useState(-1);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef(null);
  const messagesEndRef = useRef(null);

  const messagesTree = useRecoilValue(store.messagesTree);
  const searchResultMessagesTree = useRecoilValue(store.searchResultMessagesTree);

  const _messagesTree = isSearchView ? searchResultMessagesTree : messagesTree;

  const conversation = useRecoilValue(store.conversation) || {};
  const { conversationId } = conversation;

  const { screenshotTargetRef } = useScreenshot();

  // const models = useRecoilValue(store.models) || [];
  // const modelName = models.find(element => element.model == model)?.name;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
      const diff = Math.abs(scrollHeight - scrollTop);
      const percent = Math.abs(clientHeight - diff) / clientHeight;
      const hasScrollbar = scrollHeight > clientHeight && percent > 0.2;
      setShowScrollButton(hasScrollbar);
    }, 650);

    // Add a listener on the window object
    window.addEventListener('scroll', handleScroll);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [_messagesTree]);

  const scrollToBottom = useCallback(
    throttle(
      () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollButton(false);
      },
      750,
      { leading: true }
    ),
    [messagesEndRef]
  );

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const diff = Math.abs(scrollHeight - scrollTop);
    const percent = Math.abs(clientHeight - diff) / clientHeight;
    if (percent <= 0.2) {
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

  const scrollHandler = e => {
    e.preventDefault();
    scrollToBottom();
  };

  return (
    <div
      className="flex-1 overflow-y-auto pt-0"
      ref={scrollableRef}
      onScroll={debouncedHandleScroll}
    >
      <div
        className="dark:gpt-dark-gray h-auto"
        ref={screenshotTargetRef}
      >
        <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
          <MessageHeader isSearchView={isSearchView} />
          {_messagesTree === null ? (
            <Spinner />
          ) : _messagesTree?.length == 0 && isSearchView ? (
            <div className="flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-900/50 dark:bg-gray-800 dark:text-gray-300">
              Nothing found
            </div>
          ) : (
            <>
              <MultiMessage
                key={conversationId} // avoid internal state mixture
                messageId={conversationId}
                conversation={conversation}
                messagesTree={_messagesTree}
                scrollToBottom={scrollToBottom}
                currentEditId={currentEditId}
                setCurrentEditId={setCurrentEditId}
                isSearchView={isSearchView}
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
    </div>
  );
}
