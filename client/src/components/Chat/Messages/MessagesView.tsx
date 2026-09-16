import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useScreenshot, useMessageScrolling, useScrollbarGutter, useLocalize } from '~/hooks';
import { MessagesViewProvider, useChatContext, useFileMapContext } from '~/Providers';
import { RowMountProvider, useProgressiveRowMount } from '~/hooks/Messages';
import { useChatSurface } from '~/components/Chat/Subagents/surface';
import useThreadRows from '~/hooks/Messages/useThreadRows';
import PendingSteers from './Content/Parts/PendingSteers';
import { autoScrollAtom } from '~/store/autoScroll';
import { FLAT_THREAD, ThreadList } from './Thread';
import { fontSizeAtom } from '~/store/fontSize';
import MultiMessage from './MultiMessage';
import ScrollButton from './ScrollButton';
import PendingTurn from './PendingTurn';
import MessageNav from './MessageNav';
import { cn } from '~/utils';
import store from '~/store';
import { composerOverlayCountFamily } from '~/components/Chat/Input/overlay';

function MessagesViewContent({
  messagesTree: _messagesTree,
  messages,
}: {
  messagesTree?: TMessage[] | null;
  messages?: TMessage[] | null;
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
  const fileMap = useFileMapContext();
  const threadRows = useThreadRows(FLAT_THREAD ? messages : null, conversationId, fileMap);

  const { index, latestMessageDepth } = useChatContext();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const { showScrollButton, maximizeChatSpace } = useChatSurface();
  const autoScroll = useAtomValue(autoScrollAtom);
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
  });

  /* The redesign renders pending steers inside the streaming reply rather than
     as a stack floating over the bottom of the thread, so there is no band to
     reserve here and nothing publishes an overlay height. Composer panels that
     do float (an answer popover, a tool-approval review) are handled by
     ScrollButton through `composerOverlayCountFamily`. */
  const overlayConversationId = conversationId ?? Constants.NEW_CONVO;
  const composerOverlayOpen =
    useAtomValue(composerOverlayCountFamily(overlayConversationId)) > 0;
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
              overflowAnchor: mountWindow != null ? 'none' : undefined,
            }}
          >
            <div
              ref={contentRef}
              className="flex flex-col pb-9 pt-14"
              style={{
                /* Keep the thread tail above the review panel while preserving
                 * the panel's auto-open behavior and its independent controls. */
                paddingBottom: composerOverlayOpen ? '70vh' : undefined,
              }}
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
                      {FLAT_THREAD && threadRows ? (
                        <ThreadList
                          rows={threadRows}
                          setCurrentEditId={setCurrentEditId}
                          currentEditId={currentEditId ?? null}
                        />
                      ) : (
                        <MultiMessage
                          messagesTree={_messagesTree}
                          messageId={conversationId ?? null}
                          setCurrentEditId={setCurrentEditId}
                          currentEditId={currentEditId ?? null}
                        />
                      )}
                    </RowMountProvider>
                  </div>
                  <PendingTurn
                    scrollableRef={scrollableRef}
                    messages={messages}
                    maximizeChatSpace={maximizeChatSpace}
                  />
                </>
              )}
              {/** The pending surface is renderer-independent: both ThreadList
               * and MultiMessage end at this shared thread tail. Keeping its
               * mount here also preserves recovery controls when the message
               * tree is temporarily empty during navigation or delivery. */}
              {conversationId != null && <PendingSteers conversationId={conversationId} />}
              <div
                id="messages-end"
                className="group h-0 w-full flex-shrink-0"
                ref={messagesEndRef}
              />
            </div>
          </div>

          <ScrollButton
            conversationId={overlayConversationId}
            enabled={showScrollButton}
            maximizeChatSpace={maximizeChatSpace}
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

export default function MessagesView({
  messagesTree,
  messages,
}: {
  messagesTree?: TMessage[] | null;
  messages?: TMessage[] | null;
}) {
  return (
    <MessagesViewProvider>
      <MessagesViewContent messagesTree={messagesTree} messages={messages} />
    </MessagesViewProvider>
  );
}
