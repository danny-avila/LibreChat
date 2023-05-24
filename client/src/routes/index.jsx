import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './routes/Root';
import Chat from './routes/Chat';
import Search from './routes/Search';
import { Login, Registration, RequestPasswordReset, ResetPassword } from './components/Auth';
import { AuthContextProvider } from './hooks/AuthContext';
import ApiErrorWatcher from './components/Auth/ApiErrorWatcher';
import { publicAccess } from '../../config';

const AuthLayout = () => (
  <AuthContextProvider>
    <Outlet />
    <ApiErrorWatcher />
  </AuthContextProvider>
);  

const router = createBrowserRouter([
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