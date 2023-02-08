import React from 'react';
import { useSelector } from 'react-redux';
import Messages from './components/main/Messages';
import TextChat from './components/main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import { swr } from './utils/fetchers';
import useDidMountEffect from './hooks/useDidMountEffect';

const App = () => {
  const { messages } = useSelector((state) => state.messages);
  const { conversationId } = useSelector((state) => state.convo);
  const { data, error, isLoading, mutate } = swr('http://localhost:3050/convos');
  useDidMountEffect(() => mutate(), [conversationId]);

  return (
    <div className="flex h-screen">
      <Nav conversations={data} />
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden">
          <div className="h-full dark:bg-gray-800">
          <MobileNav />
          <Messages messages={messages} />
          <TextChat
            messages={messages}
            reloadConvos={mutate}
          />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
