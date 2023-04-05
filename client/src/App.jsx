import React, { useEffect, useState } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
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
        path: 'chat/:conversationId?',
        element: <Chat />
      },
      {
        path: 'search/:query?',
        element: <Search />
      }
    ]
  }
]);

const App = () => {
  const [user, setUser] = useRecoilState(store.user);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setEndpointsConfig = useSetRecoilState(store.endpointsConfig);
  const setPresets = useSetRecoilState(store.presets);

  useEffect(() => {
    // fetch if seatch enabled
    axios
      .get('/api/search/enable', {
        timeout: 1000,
        withCredentials: true
      })
      .then(res => {
        setIsSearchEnabled(res.data);
      });

    // fetch user
    userAuth()
      .then(user => setUser(user))
      .catch(err => console.log(err));

    // fetch models
    axios
      .get('/api/endpoints', {
        timeout: 1000,
        withCredentials: true
      })
      .then(({ data }) => {
        setEndpointsConfig(data);
      })
      .catch(error => {
        console.error(error);
        console.log('Not login!');
        window.location.href = '/auth/login';
      });

    // fetch presets
    axios
      .get('/api/presets', {
        timeout: 1000,
        withCredentials: true
      })
      .then(({ data }) => {
        setPresets(data);
      })
      .catch(error => {
        console.error(error);
        console.log('Not login!');
        window.location.href = '/auth/login';
      });
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
