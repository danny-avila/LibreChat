import { createBrowserRouter, Outlet, Navigate } from 'react-router-dom';
import Root from './Root';
import { Login, Registration, RequestPasswordReset, ResetPassword, ApiErrorWatcher } from '@/modules/auth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import { Dashboard } from '@/modules/Dashboard';
import { Users } from '@/modules/Users';
import appConfig from '@/appConfig';

const AuthLayout = () => (
  <AuthContextProvider authConfig={appConfig}>
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
        element: <Login loginRedirect={appConfig.loginRedirect} />
      },
      {
        path: '/',
        element: <Root />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace={true} />
          },
          {
            path: 'dashboard',
            element: <Dashboard />
          },
          {
            path: 'users',
            element: <Users />
          }
        ]
      }
    ]
  }
]);
