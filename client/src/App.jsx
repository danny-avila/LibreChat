import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import store from './store';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { ScreenshotProvider } from './utils/screenshotContext.jsx';
import { useGetSearchEnabledQuery, useGetUserQuery, useGetEndpointsQuery, useGetPresetsQuery} from '~/data-provider';

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

  const searchEnabledQuery = useGetSearchEnabledQuery();
  const userQuery = useGetUserQuery();
  const endpointsQuery = useGetEndpointsQuery();
  const presetsQuery = useGetPresetsQuery();

  if(endpointsQuery.data) {
    setEndpointsConfig(endpointsQuery.data);
  } else if(endpointsQuery.isError) {
    console.error("Failed to get endpoints", endpointsQuery.error);
    window.location.href = '/auth/login';
  }

  if(presetsQuery.data) {
    setPresets(presetsQuery.data);
  } else if(presetsQuery.isError) {
    console.error("Failed to get presets", presetsQuery.error);
    window.location.href = '/auth/login';
  }

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


  if (user)
    return (
      <RouterProvider router={router} />
    );
  else return <div className="flex h-screen"></div>;
};

export default () => (
  <ScreenshotProvider>
    <App />
  </ScreenshotProvider>
);
