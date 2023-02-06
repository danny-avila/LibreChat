import React, { useState } from 'react';
import Messages from './components/Messages';
import TextChat from './components/TextChat';

const App = () => {
  const [messages, setMessages] = useState([]);

  return (
    <div className="flex h-screen">
      <div className="w-80 bg-slate-800"></div>
      <div className="flex h-full w-full flex-col bg-gray-50 ">
        <Messages messages={messages} />
        <TextChat messages={messages} setMessages={setMessages}/>
      </div>
    </div>
  );
};

export default App;
