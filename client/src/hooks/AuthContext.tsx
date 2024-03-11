import {
  useMemo,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { useRecoilState } from 'recoil';
import { TUser, setTokenHeader } from 'librechat-data-provider';
import { useGetUserQuery } from 'librechat-data-provider/react-query';
import { useNavigate } from 'react-router-dom';
import { TAuthConfig, TUserContext, TAuthContext } from '~/common';
import { useLogoutUserMutation } from '~/data-provider';
import useTimeout from './useTimeout';
import store from '~/store';
import { useAuth, useSession } from '@clerk/clerk-react';

const AuthContext = createContext<TAuthContext | undefined>(undefined);

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const { isLoaded: isLoadedClerk, isSignedIn, getToken } = useAuth();
  const { session } = useSession();

  const [user, setUser] = useRecoilState(store.user);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | undefined>(undefined);

  const navigate = useNavigate();

  const setUserContext = useCallback(
    (userContext: TUserContext) => {
      const { isAuthenticated, user, redirect } = userContext;
      if (user) {
        setUser(user);
      }
      setToken(token);
      //@ts-ignore - ok for token to be undefined initially
      setTokenHeader(token);
      setIsAuthenticated(isAuthenticated);
      if (redirect) {
        navigate(redirect, { replace: true });
      }
    },
    [navigate, setUser, token],
  );
  const doSetError = useTimeout({ callback: (error) => setError(error as string | undefined) });

  const logoutUser = useLogoutUserMutation({
    onSuccess: () => {
      setUserContext({
        token: undefined,
        isAuthenticated: false,
        user: undefined,
        redirect: '/login',
      });
    },
    onError: (error) => {
      doSetError((error as Error).message);
      setUserContext({
        token: undefined,
        isAuthenticated: false,
        user: undefined,
        redirect: '/login',
      });
    },
  });

  const logout = useCallback(() => logoutUser.mutate(undefined), [logoutUser]);
  const userQuery = useGetUserQuery({ enabled: !!token });

  function refreshToken() {
    getToken({ leewayInSeconds: 59, skipCache: false })
      .then((token) => {
        if (token) {
          setTokenHeader(token);
          setToken(token);
        }
      })
      .catch((error) => {
        doSetError((error as Error).message);
      });
  }

  useEffect(() => {
    if (!isLoadedClerk || !isSignedIn) {
      return;
    }
    refreshToken();
    setInterval(refreshToken, 45_000);
  }, [isLoadedClerk, isSignedIn]);

  useEffect(() => {
    if (isSignedIn) {
      setUserContext({ token, isAuthenticated: true, user: userQuery.data, redirect: undefined });
    } else if (isLoadedClerk) {
      if (!window.location.href.includes('/register')) {
        navigate('/login', { replace: true });
      }
    }
  }, [
    token,
    isLoadedClerk,
    isSignedIn,
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    navigate,
    setUserContext,
  ]);

  const memoedValue = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      error,
      logout,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, error, token, isAuthenticated],
  );

  return <AuthContext.Provider value={memoedValue}>{children}</AuthContext.Provider>;
};

const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext should be used inside AuthProvider');
  }

  return context;
};

export { AuthContextProvider, useAuthContext };
