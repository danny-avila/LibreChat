import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import React, { useEffect } from 'react';
import { gtag, install } from 'ga-gtag';
import Root from './Root';
import Chat from './Chat';
import Search from './Search';
import TermsAndConditions from '../components/ui/TermsAndConditions';
import PrivacyPolicy from '../components/ui/PrivacyPolicy';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '../components/Auth';
import { AuthContextProvider } from '../hooks/AuthContext';
import ApiErrorWatcher from '../components/Auth/ApiErrorWatcher';

const AuthLayout = () => {
  const location = useLocation();

  useEffect(() => {
    install('G-2HYZSSFTSV'); // replace 'G-2HYZSSFTSV' with your GA measurement ID
    gtag('event', 'page_view', { 'page_path': location.pathname + location.search });
  }, [location]);

  return (
    <AuthContextProvider>
      <Outlet />
      <ApiErrorWatcher />
    </AuthContextProvider>
  );
};

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
    path: 'terms',
    element: <TermsAndConditions />
  },
  {
    path: 'privacy',
    element: <PrivacyPolicy />
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
