import React from 'react';
import Messages from './components/main/Messages';
import TextChat from './components/main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import { useSelector } from 'react-redux';

const App = () => {

  const { messages } = useSelector((state) => state.messages);
  const convo = useSelector((state) => state.convo);

  return (
    <div className="flex h-screen">
      <Nav />
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden dark:bg-gray-800">
          <MobileNav />
          <Messages messages={messages} title={convo.title}/>
          <TextChat messages={messages}/>
        </div>
      </div>
    </div>
  );
};

export default App;
