import React, { useState, useEffect, useCallback, useMemo, ReactNode, createContext, useContext } from 'react';
import { TUser, TLoginResponse, setTokenHeader } from '~/data-provider';
import { useNavigate } from 'react-router-dom';
import { useLoginUserMutation, useLogoutUserMutation, useGetUserQuery, useRefreshTokenMutation, TLoginUser } from '~/data-provider';
import store from '~/store';

export type TAuthContext = {
  user: TUser | undefined,
  token: string | undefined,
  isAuthenticated: boolean,
  isLoading: boolean,
  error: string | undefined,
  login: (data: TLoginUser) => void,
  logout: () => void
};

export type TUserContext = {
  user: TUser | undefined,
  token: string | undefined,
  isAuthenticated: boolean,
  redirect?: string,
}

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
  const refreshToken = useRefreshTokenMutation();

  const { newConversation } = store.useConversation();

  const setUserContext = (userContext: TUserContext) => {
    const { user, token, isAuthenticated, redirect } = userContext;
    setUser(user);
    setToken(token);
    setTokenHeader(token);
    setIsAuthenticated(isAuthenticated);
    if (redirect) {
      navigate(redirect);
    }
  };

  const login = (data: TLoginUser) => {
    loginUser.mutate(data, {
      onSuccess: (data: TLoginResponse) => {
        const { user, token } = data;
        console.log(data)
       // document.cookie = `token=${token}; path=/; expires=${new Date(Date.now() + 1000 * 60 * 60 * 24).toUTCString()}`;
       localStorage.setItem('token', token);
       setUserContext({ user, token, isAuthenticated: true, redirect: '/chat/new' });
       newConversation();
      },
      onError: error => {
        setError(error.message);
      }
    });
  };

  const logout = () => {
    // document.cookie.split(';').forEach(c => {
    //   document.cookie = c
    //     .replace(/^ +/, '')
    //     .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    // });
     const localStorageKeys = Object.keys(localStorage);
     localStorageKeys.forEach(key => {
       if (key.includes('token')) {
         localStorage.removeItem(key);
       }
     });
    logoutUser.mutate(undefined, {
      onSuccess: () => {
        setUserContext({ user: undefined, token: undefined, isAuthenticated: false, redirect: '/login' });
      },
      onError: error => {
        setError(error.message);
      }
    });
  };

  useEffect(() => {
    const localStorageToken = localStorage.getItem('token');
    if(!token && localStorageToken) {
      setToken(localStorageToken);
      setTokenHeader(localStorageToken);
      setIsAuthenticated(true);
    }
  }, [token]);

  // const silentRefresh = useCallback(() => {
  //   refreshToken.mutate(undefined, {
  //     onSuccess: (data: TLoginResponse) => {
  //       const { user, token } = data;
  //       setUserContext({ user, token, isAuthenticated: true });
  //     },
  //     onError: error => {
  //       setError(error.message);
  //     }
  //   });
  //   setTimeout(silentRefresh, 5 * 60 * 1000);
  // }, [setUserContext]);

    useEffect(() => {
      if (loginUser.isLoading || logoutUser.isLoading) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
    }, [loginUser.isLoading, logoutUser.isLoading]);

    useEffect(() => {
      if (userQuery.data) {
        setUser(userQuery.data);
      } else if (userQuery.isError) {
        navigate('/login');
      }
    }, [userQuery.data, userQuery.isError]);
    // useEffect(() => {
    //   if (token)
    //   silentRefresh();
    // }, [token, silentRefresh]);

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
