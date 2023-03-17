import React, { useEffect, useState } from 'react';
import Message from './Message';

export default function MultiMessage({
  messageList,
  messages,
  scrollToBottom,
  currentEditId,
  setCurrentEditId
}) {
  const [siblingIdx, setSiblingIdx] = useState(0);

  const setSiblingIdxRev = (value) => {
    setSiblingIdx(messageList?.length - value - 1);
  };

  useEffect(() => {
    // reset siblingIdx when changes, mostly a new message is submitting.
    setSiblingIdx(0);
  }, [messageList?.length])

  // if (!messageList?.length) return null;
  if (!(messageList && messageList.length)) {
    return null;
  }

  if (siblingIdx >= messageList?.length) {
    setSiblingIdx(0);
    return null;
  }

  return (
    <Message
      key={messageList[messageList.length - siblingIdx - 1].messageId}
      message={messageList[messageList.length - siblingIdx - 1]}
      messages={messages}
      scrollToBottom={scrollToBottom}
      currentEditId={currentEditId}
      setCurrentEditId={setCurrentEditId}
      siblingIdx={messageList.length - siblingIdx - 1}
      siblingCount={messageList.length}
      setSiblingIdx={setSiblingIdxRev}
    />
  );
}
