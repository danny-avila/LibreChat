import { useEffect, useState, useRef } from 'react';
import { CSSTransition } from 'react-transition-group';
import { useRecoilValue } from 'recoil';

import ScrollToBottom from './ScrollToBottom';
import MessageHeader from './MessageHeader';
import MultiMessage from './MultiMessage';
import { Spinner } from '~/components';
import { useScreenshot, useScrollToRef } from '~/hooks';

import store from '~/store';

export default function Messages({ isSearchView = false }) {
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const messagesTree = useRecoilValue(store.messagesTree);
  const showPopover = useRecoilValue(store.showPopover);
  const searchResultMessagesTree = useRecoilValue(store.searchResultMessagesTree);

  const _messagesTree = isSearchView ? searchResultMessagesTree : messagesTree;

  const conversation = useRecoilValue(store.conversation);
  const { conversationId } = conversation ?? {};

  const { screenshotTargetRef } = useScreenshot();

  const handleScroll = () => {
    if (!scrollableRef.current) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const diff = Math.abs(scrollHeight - scrollTop);
    const percent = Math.abs(clientHeight - diff) / clientHeight;
    if (percent <= 0.2) {
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!scrollableRef.current) {
        return;
      }
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

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const debouncedHandleScroll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleScroll, 100);
  };

  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef(messagesEndRef, () =>
    setShowScrollButton(false),
  );

  return (
    <div
      className="flex-1 overflow-y-auto pt-0"
      ref={scrollableRef}
      onScroll={debouncedHandleScroll}
    >
      <div className="dark:gpt-dark-gray mb-32 h-auto md:mb-48" ref={screenshotTargetRef}>
        <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
          <MessageHeader isSearchView={isSearchView} />
          {_messagesTree === null ? (
            <div className="flex h-screen items-center justify-center">
              <Spinner />
            </div>
          ) : _messagesTree?.length == 0 && isSearchView ? (
            <div className="flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-900/50 dark:bg-gray-800 dark:text-gray-300">
              Nothing found
            </div>
          ) : (
            <>
              <MultiMessage
                key={conversationId} // avoid internal state mixture
                messageId={conversationId ?? null}
                conversation={conversation}
                messagesTree={_messagesTree}
                scrollToBottom={scrollToBottom}
                currentEditId={currentEditId ?? null}
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
                {() =>
                  showScrollButton &&
                  !showPopover && <ScrollToBottom scrollHandler={handleSmoothToRef} />
                }
              </CSSTransition>
            </>
          )}
          <div
            className="dark:gpt-dark-gray group h-0 w-full flex-shrink-0 dark:border-gray-900/50"
            ref={messagesEndRef}
          />
        </div>
      </div>
    </div>
  );
}
