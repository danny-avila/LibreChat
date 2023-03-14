import React, { useEffect, useState, useRef, useMemo } from 'react';
import { CSSTransition } from 'react-transition-group';
import ScrollToBottom from './ScrollToBottom';
import { MultiMessage } from './Message';
import Conversation from '../Conversations/Conversation';
import { useSelector } from 'react-redux';

const Messages = ({ messages }) => {
  const [currentEditId, setCurrentEditId] = useState(-1)
  const { conversationId } = useSelector((state) => state.convo);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const scrollable = scrollableRef.current;
      const hasScrollbar = scrollable.scrollHeight > scrollable.clientHeight;
      setShowScrollButton(hasScrollbar);
    }, 650);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [messages]);
  
  const messageTree = useMemo(() => buildTree(messages), [messages, ]);

  console.log('messageTree', messageTree);

  function buildTree(messages) {
    let messageMap = {};
    let rootMessages = [];
  
    // Traverse the messages array and store each element in messageMap.
    messages.forEach(message => {
      messageMap[message.messageId] = {...message, children: []};

      if (message.parentMessageId === "00000000-0000-0000-0000-000000000000") {
        rootMessages.push(messageMap[message.messageId]);
      } else {
        const parentMessage = messageMap[message.parentMessageId];
        if (parentMessage) {
          parentMessage.children.push(messageMap[message.messageId]);
        }
      }
    });
  
    return rootMessages;
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
    const diff = Math.abs(scrollHeight - scrollTop);
    const bottom =
      diff === clientHeight || (diff <= clientHeight + 25 && diff >= clientHeight - 25);
    if (bottom) {
      setShowScrollButton(false);
    } else {
      setShowScrollButton(true);
    }
  };

  let timeoutId = null;
  const debouncedHandleScroll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleScroll, 100);
  };

  const scrollHandler = (e) => {
    e.preventDefault();
    scrollToBottom();
  };

  return (
    <div
      className="flex-1 overflow-y-auto "
      ref={scrollableRef}
      onScroll={debouncedHandleScroll}
    >
      {/* <div className="flex-1 overflow-hidden"> */}
      <div className="h-full dark:gpt-dark-gray">
        <div className="flex h-full flex-col items-center text-sm dark:gpt-dark-gray">
          <MultiMessage
            key={conversationId} // avoid internal state mixture
            messageList={messageTree}
            messages={messages}
            scrollToBottom={scrollToBottom}
            currentEditId={currentEditId}
            setCurrentEditId={setCurrentEditId}
          />
          <CSSTransition
            in={showScrollButton}
            timeout={400}
            classNames="scroll-down"
            unmountOnExit={false}
            // appear
          >
            {() => showScrollButton && <ScrollToBottom scrollHandler={scrollHandler} />}
          </CSSTransition>

          <div
            className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:gpt-dark-gray md:h-48"
            ref={messagesEndRef}
          />
        </div>
      </div>
      {/* </div> */}
    </div>
  );
};

export default Messages;
