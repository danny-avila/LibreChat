import React, { useState, useEffect, useMemo, ReactNode, createContext, useContext } from 'react';
import { TUser, TLoginResponse, setTokenHeader } from '~/data-provider';
import { useNavigate } from 'react-router-dom';
import { useLoginUserMutation, useLogoutUserMutation, useGetUserQuery, TLoginUser } from '~/data-provider';

export type TAuthContext = {
  user: TUser | undefined,
  token: string | undefined,
  isAuthenticated: boolean,
  isLoading: boolean,
  error: string | undefined,
  login: (data: TLoginUser) => void,
  logout: () => void
};

const AuthContext = createContext<TAuthContext | undefined>(undefined);

const AuthContextProvider = ({ children }: { children: ReactNode }) => {

  const [user, setUser] = useState<TUser | undefined> (undefined);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const navigate = useNavigate();
  const loginUser = useLoginUserMutation();
  const logoutUser = useLogoutUserMutation();
  const userQuery = useGetUserQuery({enabled: !!token});

  useEffect(() => {
    if (loginUser.isLoading || logoutUser.isLoading) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [loginUser.isLoading, logoutUser.isLoading]);

  useEffect(() => {
    if (userQuery.data) {
      console.log('Got user', userQuery.data);
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      console.error('Failed to get user', userQuery.error);
      // navigate('/login');
    }
  }, [userQuery.data, userQuery.isError]);

  const login = (data: TLoginUser) => {
    loginUser.mutate(data, {
      onSuccess: (data: TLoginResponse) => {
        const { user, token } = data;
        setUser(user);
        setToken(token);
        setTokenHeader(token);
        setIsAuthenticated(true);
        navigate('/chat/new');
      },
      onError: error => {
        setError(error.message);
      }
    });
  };

  const logout = () => {
    logoutUser.mutate(undefined, {
      onSuccess: () => {
        setUser(undefined);
        setToken(undefined);
        setTokenHeader(undefined);
        setIsAuthenticated(false);
        navigate('/');
      },
      onError: error => {
        setError(error.message);
      }
    });
  };

  // Make the provider update only when it should
  const memoedValue = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isLoading, error, isAuthenticated, token]
  );

  return (
    <AuthContext.Provider value={memoedValue}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext should be used inside AuthProvider');
  }

  return context;
};

export { AuthContextProvider, useAuthContext };
