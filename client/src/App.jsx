import React, { useEffect, useState } from 'react';
import Messages from './components/Messages';
import Landing from './components/Main/Landing';
import TextChat from './components/Main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useSelector } from 'react-redux';

const App = () => {
  const { messages, messageTree } = useSelector((state) => state.messages);
  const { title } = useSelector((state) => state.convo);
  const { conversationId } = useSelector((state) => state.convo);
  const [ navVisible, setNavVisible ]= useState(false)
  useDocumentTitle(title);

  return (
    <div className="flex h-screen">
      <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white dark:bg-gray-800">
          <MobileNav setNavVisible={setNavVisible} />
          {messages.length === 0 ? (
            <Landing title={title} />
          ) : (
            <Messages
              messages={messages}
              messageTree={messageTree}
            />
          )}
          <TextChat messages={messages} />
        </div>
      </div>
    </div>
  );
};

export default App;
