import React from 'react';
import Messages from './components/main/Messages';
import Landing from './components/main/Landing';
import TextChat from './components/main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useDispatch, useSelector } from 'react-redux';
import { setConvos } from '~/store/convoSlice';

const App = () => {
  const { messages } = useSelector((state) => state.messages);
  const { title } = useSelector((state) => state.convo);
  const dispatch = useDispatch();
  const { data, error, isLoading, mutate } = swr('http://localhost:3050/convos', (res) => dispatch(setConvos(res)));

  useDocumentTitle(title);

  return (
    <div className="flex h-screen">
      <Nav />
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden dark:bg-gray-800">
          <MobileNav />
          {messages.length === 0 ? (
            <Landing title={title} />
          ) : (
            <Messages
              messages={messages}
            />
          )}
          <TextChat messages={messages} />
        </div>
      </div>
    </div>
  );
};

export default App;
