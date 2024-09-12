import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { ReactNode } from 'react';
import type { TMessage } from 'librechat-data-provider';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { useScreenshot, useMessageScrolling } from '~/hooks';
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

export default function MessagesView({
  messagesTree: _messagesTree,
  Header,
}: {
  messagesTree?: TMessage[] | null;
  Header?: ReactNode;
}) {
  const fontSize = useRecoilValue(store.fontSize);
  const { screenshotTargetRef } = useScreenshot();
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);

  const {
    conversation,
    scrollableRef,
    messagesEndRef,
    showScrollButton,
    handleSmoothToRef,
    debouncedHandleScroll,
  } = useMessageScrolling(_messagesTree);

  const { conversationId } = conversation ?? {};

  return (
    <div className="flex-1 overflow-hidden overflow-y-auto">
      <div className="relative h-full">
        <div
          onScroll={debouncedHandleScroll}
          ref={scrollableRef}
          style={{
            height: '100%',
            overflowY: 'auto',
            width: '100%',
          }}
        >
          <div className="flex flex-col pb-9 dark:bg-transparent">
            {(_messagesTree && _messagesTree.length == 0) || _messagesTree === null ? (
              <div
                className={cn(
                  'flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300',
                  fontSize,
                )}
              >
                Nothing found
              </div>
            ) : (
              <>
                {Header && Header}
                <div ref={screenshotTargetRef}>
                  <MultiMessage
                    key={conversationId} // avoid internal state mixture
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
