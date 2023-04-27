import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import store from './store';
import { useSetRecoilState } from 'recoil';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import {
  useGetSearchEnabledQuery,
  useGetEndpointsQuery,
  useGetPresetsQuery
} from '~/data-provider';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Login from './components/Auth/Login';
import Registration from './components/Auth/Registration';
import { AuthContextProvider } from './hooks/AuthContext';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
  </AuthContextProvider>
);
const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <Login />
      },
      {
        path: 'register',
        element: <Registration />
      },
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
    ]
  }
]);

const App = () => {

  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setEndpointsConfig = useSetRecoilState(store.endpointsConfig);
  const setPresets = useSetRecoilState(store.presets);

  const searchEnabledQuery = useGetSearchEnabledQuery();
  const endpointsQuery = useGetEndpointsQuery();
  const presetsQuery = useGetPresetsQuery();

  useEffect(() => {
    if (endpointsQuery.data) {
      setEndpointsConfig(endpointsQuery.data);
    } else if (endpointsQuery.isError) {
      console.error('Failed to get endpoints', endpointsQuery.error);
    }
  }, [endpointsQuery.data, endpointsQuery.isError]);

  useEffect(() => {
    if (presetsQuery.data) {
      setPresets(presetsQuery.data);
    } else if (presetsQuery.isError) {
      console.error('Failed to get presets', presetsQuery.error);
    }
  }, [presetsQuery.data, presetsQuery.isError]);

  useEffect(() => {
    if (searchEnabledQuery.data) {
      setIsSearchEnabled(searchEnabledQuery.data);
    } else if (searchEnabledQuery.isError) {
      console.error('Failed to get search enabled', searchEnabledQuery.error);
    }
  }, [searchEnabledQuery.data, searchEnabledQuery.isError]);

  return (
    <>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
};

export default () => (
  <ScreenshotProvider>
    <App />
  </ScreenshotProvider>
);
