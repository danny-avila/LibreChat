import React, { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import store from './store';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useGetSearchEnabledQuery, useGetUserQuery, useGetModelsQuery} from '~/data-provider';

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
  const setModelsFilter = useSetRecoilState(store.modelsFilter);

  const searchEnabledQuery = useGetSearchEnabledQuery();
  const userQuery = useGetUserQuery();
  const modelsQuery = useGetModelsQuery();

  useEffect(() => {
    if (searchEnabledQuery.error) {
      console.error("Failed to get search enabled", searchEnabledQuery.error);
    }
    if (searchEnabledQuery.data) {
      setIsSearchEnabled(searchEnabledQuery.data);
    }
  }, [searchEnabledQuery.data, setIsSearchEnabled, searchEnabledQuery.error]);

  useEffect(() => {
    if (userQuery.error) {
      console.error("Failed to get user", userQuery.error);
    }
    if (userQuery.data) {
      setUser(userQuery.data);
    }
  }, [userQuery.data, setUser, userQuery.error]);

  useEffect(() => {
    const { data, error } = modelsQuery;
    if (error) {
      console.error("Failed to get models", error);
    }
    if (data) {
      const filter = {
        chatgpt: data?.hasOpenAI,
        chatgptCustom: data?.hasOpenAI,
        bingai: data?.hasBing,
        sydney: data?.hasBing,
        chatgptBrowser: data?.hasChatGpt
      };
      setModelsFilter(filter);
    }
  }, [modelsQuery.data, setModelsFilter, modelsQuery.error, modelsQuery]);

  if (user)
    return (
      <RouterProvider router={router} />
    );
  else return <div className="flex h-screen"></div>;
};

export default App;
