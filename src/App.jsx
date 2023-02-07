import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Messages from './components/Messages';
import TextChat from './components/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/MobileNav';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import useDidMountEffect from './hooks/useDidMountEffect.js';
import axios from 'axios';

const fetcher = (url) => fetch(url).then((res) => res.json());
const postRequest = async (url, { arg }) => await axios.post(url, { arg });

const App = () => {
  // const [messages, setMessages] = useState([]);
  const messages = useSelector((state) => state.messages);
  // const [convo, setConvo] = useState({ conversationId: null, parentMessageId: null });
  const { data, error, isLoading, mutate } = useSWR('http://localhost:3050/convos', fetcher);

  const convo = useSelector((state) => state.convo);
  const conversationId = useSelector((state) => state.convo.conversationId);
  console.log('conversationId', conversationId);

  // const conversation = useSWRMutation(
  //   //{ trigger, isMutating }
  //   `http://localhost:3050/messages/${conversationId}`,
  //   fetcher,
  //   {
  //     onSuccess: function (res) {
  //       console.log('success', res);
  //       setMessages(res);
  //     }
  //   }
  // );

  // useDidMountEffect(() => conversation.trigger(), [conversationId]);

  // const onConvoClick = (conversationId, parentMessageId) => {
  //   console.log('convo was clicked');
  //   setConvo({ conversationId, parentMessageId });
  // };

  return (
    <div className="flex h-screen">
      {/* <div className="w-80 bg-slate-800"></div> */}
      <Nav
        conversations={data}
        convo={convo}
      />
      {/* <div className="flex h-full flex-1 flex-col md:pl-[260px]"> */}
      <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
        {/* <main className="relative h-full w-full transition-width flex flex-col overflow-hidden items-stretch flex-1"> */}
        <MobileNav />
        <Messages messages={messages} />
        <TextChat
          messages={messages}
          // setMessages={setMessages}
          reloadConvos={mutate}
          convo={convo}
        />
        {/* </main> */}
      </div>
    </div>
  );
};

export default App;
