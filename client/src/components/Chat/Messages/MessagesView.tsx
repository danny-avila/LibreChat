import { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useLocalize } from '~/hooks';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import MultiMessage from './MultiMessage';
import { cn } from '~/utils';
import store from '~/store';

export default function MessagesView({
  messagesTree: _messagesTree,
}: {
  messagesTree?: TMessage[] | null;
}) {
  const localize = useLocalize();
  const fontSize = useRecoilValue(store.fontSize);
  const { screenshotTargetRef } = useScreenshot();
  const scrollButtonPreference = useRecoilValue(store.showScrollButton);
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

  /* For help-others conversations, the first user message is the intake-form
   * submission. Hide it from the chat view by descending to its children. */
  const messagesTree = useMemo(() => {
    if (conversation?.spec !== 'help-others' || !_messagesTree?.length) {
      return _messagesTree;
    }
    const firstRoot = _messagesTree[0] as TMessage & { children?: TMessage[] };
    if (firstRoot.isCreatedByUser && firstRoot.children?.length) {
      return firstRoot.children;
    }
    return _messagesTree;
  }, [_messagesTree, conversation?.spec]);

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
            <div className="flex flex-col pb-9 dark:bg-transparent">
              {(messagesTree && messagesTree.length == 0) || messagesTree === null ? (
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
                      key={conversationId}
                      messagesTree={messagesTree}
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
            in={showScrollButton && scrollButtonPreference}
            timeout={{
              enter: 550,
              exit: 700,
            }}
            classNames="scroll-animation"
            unmountOnExit={true}
            appear={true}
          >
            <ScrollToBottom scrollHandler={handleSmoothToRef} />
          </CSSTransition>
        </div>
      </div>
    </>
  );
}
