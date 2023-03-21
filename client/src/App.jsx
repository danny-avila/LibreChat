import React, { useEffect, useState } from 'react';
import Messages from './components/Messages';
import Landing from './components/Main/Landing';
import TextChat from './components/Main/TextChat';
import Nav from './components/Nav';
import MobileNav from './components/Nav/MobileNav';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useSelector, useDispatch } from 'react-redux';
import userAuth from './utils/userAuth';
import { setUser } from './store/userReducer';
import { setSearchState } from './store/searchSlice';
import axios from 'axios';

const App = () => {
  const dispatch = useDispatch();

  const { messages, messageTree } = useSelector((state) => state.messages);
  const { user } = useSelector((state) => state.user);
  const { title } = useSelector((state) => state.convo);
  const [navVisible, setNavVisible] = useState(false);
  useDocumentTitle(title);

  useEffect(() => {
    axios.get('/api/search/enable').then((res) => { console.log(res.data); dispatch(setSearchState(res.data))});
    userAuth()
      .then((user) => dispatch(setUser(user)))
      .catch((err) => console.log(err));
  }, []);

  if (user)
    return (
      <div className="flex h-screen">
        <Nav
          navVisible={navVisible}
          setNavVisible={setNavVisible}
        />
        <div className="flex h-full w-full flex-1 flex-col bg-gray-50 md:pl-[260px]">
          <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white dark:bg-gray-800">
            <MobileNav setNavVisible={setNavVisible} />
            {messages.length === 0 && title.toLowerCase() === 'chatgpt clone' ? (
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
  else return <div className="flex h-screen"></div>;
};

export default App;
