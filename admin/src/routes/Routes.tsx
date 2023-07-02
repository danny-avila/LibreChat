import { createBrowserRouter, Outlet } from 'react-router-dom';
import Root from './Root';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '~/components/Auth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import ApiErrorWatcher from '~/components/Auth/ApiErrorWatcher';
import {Dashboard} from '@/modules/Dashboard';
import {Users} from '@/modules/Users';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);

export const router = createBrowserRouter([
  {
    path: 'register',
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
            element: <Dashboard />
          },
          {
            path: 'users',
            element: <Users />
          },
        ]
      }
    ]
  }
]);