import { memo, useState, useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useLocalize } from '~/hooks';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { MessagesViewProvider } from '~/Providers';
import { fontSizeAtom } from '~/store/fontSize';
import MultiMessage from './MultiMessage';
import MessageNav from './MessageNav';
import { cn } from '~/utils';
import store from '~/store';

const intersectionThreshold = 0.85;
const visibilityDebounceRate = 150;

/**
 * Owns the messages-end IntersectionObserver and the button visibility state,
 * so scroll-position flips re-render only this component instead of the whole
 * message tree host. Intersection is reported up through `onNearBottomChange`
 * for the resize-follow logic in `useMessageScrolling`.
 */
const ScrollButton = memo(function ScrollButton({
  scrollableRef,
  messagesEndRef,
  scrollHandler,
  onNearBottomChange,
}: {
  scrollableRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollHandler: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onNearBottomChange: (isNearBottom: boolean) => void;
}) {
  const scrollButtonPreference = useRecoilValue(store.showScrollButton);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollToBottomRef = useRef<HTMLDivElement>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!messagesEndRef.current || !scrollableRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        onNearBottomChange(entry.isIntersecting);
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = setTimeout(() => {
          setShowScrollButton(!entry.isIntersecting);
        }, visibilityDebounceRate);
      },
      { root: scrollableRef.current, threshold: intersectionThreshold },
    );

    observer.observe(messagesEndRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutIdRef.current);
    };
  }, [messagesEndRef, scrollableRef, onNearBottomChange]);

  return (
    <CSSTransition
      in={showScrollButton && scrollButtonPreference}
      timeout={{
        enter: 300,
        exit: 250,
      }}
      classNames="scroll-animation"
      unmountOnExit={true}
      appear={true}
      nodeRef={scrollToBottomRef}
    >
      <ScrollToBottom ref={scrollToBottomRef} scrollHandler={scrollHandler} />
    </CSSTransition>
  );
});

function MessagesViewContent({
  messagesTree: _messagesTree,
}: {
  messagesTree?: TMessage[] | null;
}) {
  const localize = useLocalize();
  const fontSize = useAtomValue(fontSizeAtom);
  const { screenshotTargetRef } = useScreenshot();
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);

  const {
    conversation,
    contentRef,
    scrollableRef,
    messagesEndRef,
    handleSmoothToRef,
    debouncedHandleScroll,
    handleNearBottomChange,
  } = useMessageScrolling(_messagesTree);

  const { conversationId } = conversation ?? {};

  return (
    <>
      <div className="relative flex-1 overflow-hidden overflow-y-auto">
        <div className="relative h-full">
          <div
            className="scrollbar-gutter-stable"
            onScroll={debouncedHandleScroll}
            ref={scrollableRef}
            style={{
              height: '100%',
              overflowY: 'auto',
              width: '100%',
            }}
          >
            <div ref={contentRef} className="flex flex-col pb-9 pt-14 dark:bg-transparent">
              {(_messagesTree && _messagesTree.length == 0) || _messagesTree === null ? (
                <div
                  className={cn(
                    'flex w-full items-center justify-center p-3 text-text-secondary',
                    fontSize,
                  )}
                >
                  {localize('com_ui_nothing_found')}
                </div>
              ) : (
                <>
                  <div ref={screenshotTargetRef}>
                    <MultiMessage
                      messagesTree={_messagesTree}
                      messageId={conversationId ?? null}
                      setCurrentEditId={setCurrentEditId}
                      currentEditId={currentEditId ?? null}
                    />
                  </div>
                </>
              )}
              <div
                id="messages-end"
                className="group h-0 w-full flex-shrink-0"
                ref={messagesEndRef}
              />
            </div>
          </div>

          <ScrollButton
            scrollableRef={scrollableRef}
            messagesEndRef={messagesEndRef}
            scrollHandler={handleSmoothToRef}
            onNearBottomChange={handleNearBottomChange}
          />

          <MessageNav scrollableRef={scrollableRef} />
        </div>
      </div>
    </>
  );
}

export default function MessagesView({ messagesTree }: { messagesTree?: TMessage[] | null }) {
  return (
    <MessagesViewProvider>
      <MessagesViewContent messagesTree={messagesTree} />
    </MessagesViewProvider>
  );
}
