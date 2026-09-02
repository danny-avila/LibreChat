import { memo, useState, useRef, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { CSSTransition } from 'react-transition-group';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useScrollbarGutter, useLocalize } from '~/hooks';
import { useOptionalChatSurface } from '~/components/Chat/Subagents/surface';
import { RowMountProvider, useProgressiveRowMount } from '~/hooks/Messages';
import { MessagesViewProvider, useChatContext } from '~/Providers';
import ScrollToBottom from '~/components/Messages/ScrollToBottom';
import { steerOverlayHeightFamily } from '~/store/steer';
import { autoScrollAtom } from '~/store/autoScroll';
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
  overlayHeight,
}: {
  scrollableRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollHandler: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onNearBottomChange: (isNearBottom: boolean) => void;
  overlayHeight: number;
}) {
  const scrollButtonPreference = useRecoilValue(store.showScrollButton);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
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
        exit: 180,
      }}
      classNames="scroll-animation"
      unmountOnExit={true}
      appear={true}
      nodeRef={scrollToBottomRef}
      onEntered={() => setIsSettled(true)}
      onExit={() => setIsSettled(false)}
    >
      <ScrollToBottom
        ref={scrollToBottomRef}
        scrollHandler={scrollHandler}
        overlayHeight={overlayHeight}
        interactive={isSettled}
      />
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

  useScrollbarGutter(scrollableRef);

  const { conversationId } = conversation ?? {};

  const { index, latestMessageDepth } = useChatContext();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const autoScroll = useAtomValue(autoScrollAtom);
  const maximizeChatSpace = useOptionalChatSurface()?.maximizeChatSpace ?? false;
  /** Re-arm from the conversation that owns the RENDERED tree: the Recoil
   *  conversation id lags the route during warm-cache navigation, and keying
   *  off it would first mount the new tree unwindowed, then narrow it after
   *  the fact — visibly unmounting rows the user is already reading. */
  const treeConversationId = _messagesTree?.[0]?.conversationId ?? conversationId;
  const mountWindow = useProgressiveRowMount({
    tailDepth: latestMessageDepth,
    anchorBottom: autoScroll || isSubmitting,
    isSubmitting,
    conversationId: treeConversationId,
    scrollableRef,
    layoutKey: maximizeChatSpace,
  });

  /** The in-flight steer overlay floats above the composer over the bottom of
   *  the thread (see `InFlightSteers`); reserve an equal band here so the
   *  newest message rests above it and older ones scroll behind. */
  const steerOverlayHeight = useAtomValue(
    steerOverlayHeightFamily(conversationId ?? Constants.NEW_CONVO),
  );

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
              /** The mount hook pins the anchor row itself (document-space
               *  measurement); native scroll anchoring reacting to the same
               *  insertions would double-correct. */
              overflowAnchor: mountWindow?.mode === 'progressive' ? 'none' : undefined,
            }}
          >
            <div
              ref={contentRef}
              className="flex flex-col pb-9 pt-14"
              style={
                steerOverlayHeight > 0
                  ? { paddingBottom: `calc(2.25rem + ${steerOverlayHeight}px)` }
                  : undefined
              }
            >
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
                  <div ref={screenshotTargetRef} data-testid="screenshot-target">
                    <RowMountProvider mountWindow={mountWindow}>
                      <MultiMessage
                        messagesTree={_messagesTree}
                        messageId={conversationId ?? null}
                        setCurrentEditId={setCurrentEditId}
                        currentEditId={currentEditId ?? null}
                      />
                    </RowMountProvider>
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
            overlayHeight={steerOverlayHeight}
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
