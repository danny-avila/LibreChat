import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import type { TMessageProps } from '~/common';
// eslint-disable-next-line import/no-cycle
import Message from './Message';
import store from '~/store';

export default function MultiMessage({
  messageId,
  conversation,
  messagesTree,
  scrollToBottom,
  currentEditId,
  setCurrentEditId,
  isSearchView,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  const setSiblingIdxRev = (value: number) => {
    setSiblingIdx((messagesTree?.length ?? 0) - value - 1);
  };

  useEffect(() => {
    // reset siblingIdx when the tree changes, mostly when a new message is submitting.
    setSiblingIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesTree?.length]);

  // if (!messageList?.length) return null;
  if (!(messagesTree && messagesTree?.length)) {
    return null;
  }

  if (siblingIdx >= messagesTree?.length) {
    setSiblingIdx(0);
    return null;
  }

  const message = messagesTree[messagesTree.length - siblingIdx - 1];
  if (isSearchView) {
    return (
      <>
        {messagesTree
          ? messagesTree.map((message) => (
            <Message
              key={message.messageId}
              conversation={conversation}
              message={message}
              scrollToBottom={scrollToBottom}
              currentEditId={currentEditId}
              setCurrentEditId={null}
              siblingIdx={1}
              siblingCount={1}
              setSiblingIdx={null}
            />
          ))
          : null}
      </>
    );
  }
  return (
    <Message
      key={message.messageId}
      conversation={conversation}
      message={message}
      scrollToBottom={scrollToBottom}
      currentEditId={currentEditId}
      setCurrentEditId={setCurrentEditId}
      siblingIdx={messagesTree.length - siblingIdx - 1}
      siblingCount={messagesTree.length}
      setSiblingIdx={setSiblingIdxRev}
    />
  );
}
