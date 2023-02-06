import React, { useState } from 'react';
import Messages from './components/Messages';
import TextChat from './components/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/MobileNav';

const App = () => {
  const [messages, setMessages] = useState([]);

  return (
    <div className="flex h-screen">
      {/* <div className="w-80 bg-slate-800"></div> */}
      <Nav />
      {/* <div className="flex h-full flex-1 flex-col md:pl-[260px]"> */}
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        <MobileNav />
        {/* <main className="relative h-full w-full transition-width flex flex-col overflow-hidden items-stretch flex-1"> */}
        <Messages messages={messages} />
        <TextChat
          messages={messages}
          setMessages={setMessages}
        />
        {/* </main> */}
      </div>
    </div>
  );
};

export default App;
