import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import Search from './Search';
import Profile from '../components/ui/Profile';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '../components/Auth';
import { AuthContextProvider } from '../hooks/AuthContext';
import ApiErrorWatcher from '../components/Auth/ApiErrorWatcher';
import Leaderboard from '~/components/ui/Leaderboard';
import Homepage from '~/components/ui/Homepage';
import SharedConvo from '~/components/ui/SharedConvo';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

export const router = createBrowserRouter([
  {
    path: 'register/:userId?',
    element: <Registration />
  },
  {
    path: 'forgot-password',
    element: <RequestPasswordReset />
  },
  {
    path: 'reset-password',
    element: <ResetPassword />
  },
  {
    element: <AuthLayout />,
    children: [
      {
        path: 'login',
        element: <Login />
      },
      {
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: <Navigate to="/chat/new" replace={true} />
          },
          {
            path: 'chat/:conversationId?',
            element: <Chat />
          },
          {
            path: 'chat/share/:conversationId?',
            element: <SharedConvo />
          },
          {
            path: 'search/:query?',
            element: <Search />
          },
          {
            path: 'leaderboard',
            element: <Leaderboard />
          },
          {
            path: 'home',
            element: <Homepage />
          },
          {
            path: 'profile/:userId?',
            element: <Profile />
          }
        ]
      }
    ]
  }
]);
