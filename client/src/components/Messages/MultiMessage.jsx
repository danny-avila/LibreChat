import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
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
  hideUser = false
}) {
  // const [siblingIdx, setSiblingIdx] = useState(0);

  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  const setSiblingIdxRev = (value) => {
    setSiblingIdx(messagesTree?.length - value - 1);
  };

  useEffect(() => {
    // reset siblingIdx when changes, mostly a new message is submitting.
    setSiblingIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesTree?.length]);

  // if (!messageList?.length) return null;
  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  if (siblingIdx >= messagesTree?.length) {
    setSiblingIdx(0);
    return null;
  }

  const message = messagesTree[messagesTree.length - siblingIdx - 1];
  if (isSearchView)
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
              hideUser={hideUser}
            />
          ))
          : null}
      </>
    );
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
      hideUser={hideUser}
    />
  );
}
