import { memo, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactElement } from 'react';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';

function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  const setSiblingIdxRev = useCallback(
    (value: number) => {
      setSiblingIdx((messagesTree?.length ?? 0) - value - 1);
    },
    [messagesTree?.length, setSiblingIdx],
  );

  useEffect(() => {
    // reset siblingIdx when the tree changes, mostly when a new message is submitting.
    setSiblingIdx(0);
  }, [messagesTree?.length, setSiblingIdx]);

  useEffect(() => {
    if (messagesTree?.length && siblingIdx >= messagesTree.length) {
      setSiblingIdx(0);
    }
  }, [siblingIdx, messagesTree?.length, setSiblingIdx]);

  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  const currentSiblingIdx = messagesTree.length - siblingIdx - 1;
  const message = messagesTree[currentSiblingIdx] as TMessage | undefined;

  if (!message) {
    return null;
  }

  /**
   * No explicit key — React uses positional reconciliation since MultiMessage
   * always renders exactly one row at this position.
   *
   * Both messageId and parentMessageId change during the SSE lifecycle
   * (client UUID → createdHandler ID → server ID), so neither can serve as a
   * stable key. Using either caused React to unmount/remount the entire subtree
   * on each SSE event, destroying memoized state and causing visible flickering.
   *
   * Without a key, React reuses the component instance and updates props in place.
   * The row wrappers and MessageRender/ContentRender are memoized with field-level
   * comparators, and sibling switches work correctly because the message prop
   * changes entirely.
   */
  const sharedProps = {
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx: currentSiblingIdx,
    siblingCount: messagesTree.length,
    setSiblingIdx: setSiblingIdxRev,
  };

  let row: ReactElement;
  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    row = <MessageParts {...sharedProps} />;
  } else if (message.content) {
    row = <MessageContent {...sharedProps} />;
  } else {
    row = <Message {...sharedProps} />;
  }

  /**
   * The child recursion is a sibling of the row (not rendered inside it), so a
   * row that bails via its memo comparator never severs the walk that delivers
   * streaming updates to descendants: `buildTree` mints fresh `children` arrays
   * on every streaming write, which re-renders exactly this spine while settled
   * rows skip their subtrees.
   */
  return (
    <>
      {row}
      <MemoizedMultiMessage
        messageId={message.messageId}
        messagesTree={message.children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}

const MemoizedMultiMessage = memo(MultiMessage);

export default MemoizedMultiMessage;
