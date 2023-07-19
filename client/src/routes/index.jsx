import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import Search from './Search';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '../components/Auth';
import { AuthContextProvider } from '../hooks/AuthContext';
import ApiErrorWatcher from '../components/Auth/ApiErrorWatcher';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

export const router = createBrowserRouter([
  {
    path: 'register',
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
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: <Navigate to="/chat/new" replace={true} />,
          },
          {
            path: 'chat/:conversationId?',
            element: <Chat />,
          },
          {
            path: 'search/:query?',
            element: <Search />,
          },
        ],
      },
    ],
  },
]);
