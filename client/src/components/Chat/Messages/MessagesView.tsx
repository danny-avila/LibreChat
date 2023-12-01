import { useLayoutEffect, useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { TMessage } from 'librechat-data-provider';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { useScreenshot, useScrollToRef } from '~/hooks';
import { CSSTransition } from 'react-transition-group';
import { useChatContext } from '~/Providers';
import MultiMessage from './MultiMessage';

export default function MessagesView({
  messagesTree: _messagesTree,
  Header,
}: {
  messagesTree?: TMessage[] | null;
  Header?: ReactNode;
}) {
  const timeoutIdRef = useRef<NodeJS.Timeout>();
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  const { conversation, setAbortScroll } = useChatContext();
  const { conversationId } = conversation ?? {};

  const { screenshotTargetRef } = useScreenshot();

  const checkIfAtBottom = useCallback(() => {
    if (!scrollableRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const diff = Math.abs(scrollHeight - scrollTop);
    const percent = Math.abs(clientHeight - diff) / clientHeight;
    const hasScrollbar = scrollHeight > clientHeight && percent >= 0.15;
    setShowScrollButton(hasScrollbar);
  }, [scrollableRef]);

  useLayoutEffect(() => {
    const scrollableElement = scrollableRef.current;
    if (!scrollableElement) {
      return;
    }
    const timeoutId = setTimeout(checkIfAtBottom, 650);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [checkIfAtBottom]);

  const debouncedHandleScroll = useCallback(() => {
    clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(checkIfAtBottom, 100);
  }, [checkIfAtBottom]);

  const scrollCallback = () => setShowScrollButton(false);
  const { scrollToRef: scrollToBottom, handleSmoothToRef } = useScrollToRef({
    targetRef: messagesEndRef,
    callback: scrollCallback,
    smoothCallback: () => {
      scrollCallback();
      setAbortScroll(false);
    },
  });

  return (
    <div className="flex-1 overflow-hidden overflow-y-auto">
      <div className="dark:gpt-dark-gray relative h-full">
        <div
          onScroll={debouncedHandleScroll}
          ref={scrollableRef}
          style={{
            height: '100%',
            overflowY: 'auto',
            width: '100%',
          }}
        >
          <div className="flex flex-col pb-9 text-sm dark:bg-transparent">
            {(_messagesTree && _messagesTree?.length == 0) || _messagesTree === null ? (
              <div className="flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-900/50 dark:bg-gray-800 dark:text-gray-300">
                Nothing found
              </div>
            ) : (
              <>
                {Header && Header}
                <div ref={screenshotTargetRef}>
                  <MultiMessage
                    key={conversationId} // avoid internal state mixture
                    messageId={conversationId ?? null}
                    messagesTree={_messagesTree}
                    scrollToBottom={scrollToBottom}
                    setCurrentEditId={setCurrentEditId}
                    currentEditId={currentEditId ?? null}
                  />
                </div>
              </>
            )}
            <div
              className="dark:gpt-dark-gray group h-0 w-full flex-shrink-0 dark:border-gray-900/50"
              ref={messagesEndRef}
            />
          </div>
        </div>
        <CSSTransition
          in={showScrollButton}
          timeout={400}
          classNames="scroll-down"
          unmountOnExit={false}
          // appear
        >
          {() => showScrollButton && <ScrollToBottom scrollHandler={handleSmoothToRef} />}
        </CSSTransition>
      </div>
    </div>
  );
}
