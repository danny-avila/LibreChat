import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import ChatRoute from './ChatRoute';
import {
  Login,
  Registration,
  RequestPasswordReset,
  ResetPassword,
  VerifyEmail,
  ApiErrorWatcher,
} from '~/components/Auth';
import TermsOfService from '~/components/TermsOfService/TermsOfService';
import PrivacyPolicy from '~/components/PrivacyPolicy/PrivacyPolicy';
import { AuthContextProvider } from '~/hooks/AuthContext';

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
    path: 'verify',
    element: <VerifyEmail />,
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
            element: <Navigate to="/c/new" replace={true} />,
          },
          {
            path: 'c/:conversationId?',
            element: <ChatRoute />,
          },
          // {
          //   path: 'search/:query?',
          //   element: <Search />,
          // },
        ],
      },
    ],
  },
  {
    path: 'terms-of-service',
    element: <TermsOfService />,
  },
  {
    path: 'privacy-policy',
    element: <PrivacyPolicy />,
  },
]);
