import { useRecoilState } from 'recoil';
import { useEffect, useCallback } from 'react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';

export default function MultiMessage({
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
   * Key on parentMessageId + siblingIdx instead of messageId.
   * messageId changes during the SSE lifecycle (client UUID → createdHandler ID → server ID),
   * which causes React to unmount/remount the entire subtree on each change — destroying
   * memoized component state and causing visible icon/image flickering.
   * parentMessageId is stable from creation through final response, and siblingIdx
   * ensures sibling switches still get clean remounts.
   */
  const stableKey = `${message.parentMessageId}_${currentSiblingIdx}`;

  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    return (
      <MessageParts
        key={stableKey}
        message={message}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
        siblingIdx={currentSiblingIdx}
        siblingCount={messagesTree.length}
        setSiblingIdx={setSiblingIdxRev}
      />
    );
  } else if (message.content) {
    return (
      <MessageContent
        key={stableKey}
        message={message}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
        siblingIdx={currentSiblingIdx}
        siblingCount={messagesTree.length}
        setSiblingIdx={setSiblingIdxRev}
      />
    );
  }

  return (
    <Message
      key={stableKey}
      message={message}
      currentEditId={currentEditId}
      setCurrentEditId={setCurrentEditId}
      siblingIdx={currentSiblingIdx}
      siblingCount={messagesTree.length}
      setSiblingIdx={setSiblingIdxRev}
    />
  );
}
