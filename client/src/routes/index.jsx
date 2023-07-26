import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import Root from './Root';
import Chat from './Chat';
import Search from './Search';
import { Login, Registration, RequestPasswordReset, ResetPassword } from '../components/Auth';
import { AuthContextProvider } from '../hooks/AuthContext';
import ApiErrorWatcher from '../components/Auth/ApiErrorWatcher';

import React, { useEffect, useState } from 'react';
import axios from 'axios';

export const AuthContext = React.createContext();

export const AuthTokenProvider = ({ children }) => {
  const [token, setToken] = useState(null);

  useEffect(() => {
    // TODO: implement your logic here to retrieve and set initial access token
  }, []);

  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        const token = await refreshAccessToken(); // TODO: implement this function
        setToken(token);
        axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
        return axios(originalRequest);
      }
      return Promise.reject(error);
    }
  );

  return (
    <AuthContextProvider value={{ token, setToken }}>
      {children}
    </AuthContextProvider>
  );
};

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
