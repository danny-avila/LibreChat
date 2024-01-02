import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import ChatRoute from './ChatRoute';
import AssistantsRoute from './AssistantsRoute';
import Search from './Search';
import {
  Login,
  Registration,
  RequestPasswordReset,
  ResetPassword,
  ApiErrorWatcher,
} from '~/components/Auth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import Profile from '../components/Profile';
import Leaderboard from '~/components/ui/Leaderboard';
import SharedConvo from '~/components/ui/SharedConvo';
import Recommendations from '~/components/ui/Recommendations';
import { useEffect } from 'react';

const AuthLayout = () => {
  useEffect(() => {
    localStorage.setItem('isSharedPage', 'false');
  }, []);

  return (
    <AuthContextProvider>
      <Outlet />
      <ApiErrorWatcher />
    </AuthContextProvider>
  );
};

export const router = createBrowserRouter([
  {
    path: 'register/:userId?',
    element: <Registration />,
  },
  {
    path: 'forgot-password',
    element: <RequestPasswordReset />,
  },
  {
    path: 'reset-password',
    element: <ResetPassword />,
  },
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <Login />,
      },
      {
        path: 'chat/share/:conversationId?',
        element: <SharedConvo />,
      },
      {
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: <Navigate to="/c/new" replace={true} />,
          },
          {
            path: 'c/:conversationId?',
            element: <ChatRoute />,
          },
          {
            path: 'chat/:conversationId?',
            element: <Chat />,
          },
          {
            path: 'a/:conversationId?',
            element: <AssistantsRoute />,
          },
          {
            path: 'search/:query?',
            element: <Search />,
          },
          {
            path: 'leaderboard',
            element: <Leaderboard />,
          },
          {
            path: 'home',
            element: <Recommendations />,
          },
          {
            path: 'profile/:userId?',
            element: <Profile />,
          },
        ],
      },
    ],
  },
]);
