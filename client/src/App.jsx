import React, { useEffect, useState } from 'react';
import Messages from './components/Messages';
import Landing from './components/Main/Landing';
import TextChat from './components/Main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useSelector, useDispatch } from 'react-redux';
import { setUser } from './store/userReducer';
import axios from 'axios';

const App = () => {
  const dispatch = useDispatch();
  
  const { messages, messageTree } = useSelector((state) => state.messages);
  const { user } = useSelector((state) => state.user);
  const { title } = useSelector((state) => state.convo);
  const [ navVisible, setNavVisible ]= useState(false)
  useDocumentTitle(title);

  useEffect(async () => {
    try {
      const response = await axios.get('/api/me', {
        timeout: 1000,
        withCredentials: true
      });
      const user = response.data;
      if (user) {
        dispatch(setUser(user));
      } else {
        console.log('Not login!');
        window.location.href = '/auth/login';
      }
    } catch (error) {
      console.error(error);
      console.log('Not login!');
      window.location.href = '/auth/login';
    }
  }, [])

  if (user)
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
  else
    return (
      <div className="flex h-screen">
        
      </div>
    )
};

export default App;
