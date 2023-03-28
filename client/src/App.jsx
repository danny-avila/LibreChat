import React, { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './routes/Root';
// import Chat from './routes/Chat';
import store from './store';
import userAuth from './utils/userAuth';
import { useRecoilState, useSetRecoilState } from 'recoil';

import axios from 'axios';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {
        index: true,
        element: (
          <Navigate
            to="/chat/new"
            replace={true}
          />
        )
      },
      {
        path: 'chat/:conversationId',
        element: null //<Chat />
      }
    ]
  }
]);

const App = () => {
  const [user, setUser] = useRecoilState(store.user);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);

  useEffect(() => {
    axios.get('/api/search/enable').then(res => {
      setIsSearchEnabled(res.data);
    });
    userAuth()
      .then(user => setUser(user))
      .catch(err => console.log(err));
  }, []);

  if (user)
    return (
      <div>
        <RouterProvider router={router} />
      </div>
    );
  else return <div className="flex h-screen"></div>;
};

export default App;
