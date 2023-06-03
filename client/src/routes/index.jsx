import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import Search from './Search';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '../components/Auth';
import { AuthContextProvider } from '../hooks/AuthContext';
import ApiErrorWatcher from '../components/Auth/ApiErrorWatcher';
const publicAccess = process.env['ALLOW_REGISTRATION'];

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);  

export const router = createBrowserRouter([
    /**
     * Guest Routes
     */
    {
        path: 'login',
        element: <AuthLayout><Login /></AuthLayout>
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
      path: 'register',
      element: publicAccess ? <Registration /> : <Navigate to="/login" replace={true} />
    },
    /**
     * Authenticated Routes
     */
    {
      path: '/',
      element: <AuthLayout><Root /></AuthLayout>,
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
          path: 'search/:query?',
          element: <Search />
        }
      ]
    }
  ]);