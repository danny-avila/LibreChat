import {
  useRef,
  useMemo,
  useState,
  useEffect,
  ReactNode,
  useContext,
  useCallback,
  createContext,
} from 'react';
import { debounce } from 'lodash';
import { useRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { setTokenHeader, SystemRoles } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import {
  useGetRole,
  useGetUserQuery,
  useLoginUserMutation,
  useLogoutUserMutation,
  useRefreshTokenMutation,
} from '~/data-provider';
import { TAuthConfig, TUserContext, TAuthContext, TResError } from '~/common';
import useTimeout from './useTimeout';
import store from '~/store';

const AuthContext = createContext<TAuthContext | undefined>(undefined);

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const [user, setUser] = useRecoilState(store.user);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const logoutRedirectRef = useRef<string | undefined>(undefined);

  const { data: userRole = null } = useGetRole(SystemRoles.USER, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: adminRole = null } = useGetRole(SystemRoles.ADMIN, {
    enabled: !!(isAuthenticated && user?.role === SystemRoles.ADMIN),
  });

  const navigate = useNavigate();

  const setUserContext = useMemo(
    () =>
      debounce((userContext: TUserContext) => {
        const { token, isAuthenticated, user, redirect } = userContext;
        setUser(user);
        setToken(token);
        //@ts-ignore - ok for token to be undefined initially
        setTokenHeader(token);
        setIsAuthenticated(isAuthenticated);

        // Determine final redirect: explicit > logoutOverride > URL param > sessionStorage
        const urlParams = new URLSearchParams(window.location.search);
        const urlRedirectEncoded = urlParams.get('redirect_to') || undefined;
        const urlRedirect = urlRedirectEncoded ? decodeURIComponent(urlRedirectEncoded) : undefined;
        const storedRedirect = sessionStorage.getItem('post_login_redirect_to') || undefined;

        const finalRedirect =
          logoutRedirectRef.current || urlRedirect || storedRedirect || redirect || undefined;
        // Clear the stored redirect
        logoutRedirectRef.current = undefined;
        if (storedRedirect) {
          sessionStorage.removeItem('post_login_redirect_to');
        }
        if (urlRedirectEncoded) {
          urlParams.delete('redirect_to');
          const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
          window.history.replaceState({}, '', newUrl);
        }

        if (finalRedirect == null) {
          return;
        }

        if (finalRedirect.startsWith('http://') || finalRedirect.startsWith('https://')) {
          window.location.href = finalRedirect;
        } else {
          navigate(finalRedirect, { replace: true });
        }
      }, 50),
    [navigate, setUser],
  );
  const doSetError = useTimeout({ callback: (error) => setError(error as string | undefined) });

  const loginUser = useLoginUserMutation({
    onSuccess: (data: t.TLoginResponse) => {
      const { user, token, twoFAPending, tempToken } = data;
      if (twoFAPending) {
        // Redirect to the two-factor authentication route.
        navigate(`/login/2fa?tempToken=${tempToken}`, { replace: true });
        return;
      }
      setError(undefined);
      setUserContext({ token, isAuthenticated: true, user, redirect: '/c/new' });
    },
    onError: (error: TResError | unknown) => {
      const resError = error as TResError;
      doSetError(resError.message);
      // Stay on login page; no redirect_to here because user actively failed login
      navigate('/login', { replace: true });
    },
  });
  const logoutUser = useLogoutUserMutation({
    onSuccess: (data) => {
      setUserContext({
        token: undefined,
        isAuthenticated: false,
        user: undefined,
        redirect: data.redirect ?? '/login',
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
  const refreshToken = useRefreshTokenMutation();

  const logout = useCallback(
    (redirect?: string) => {
      if (redirect) {
        logoutRedirectRef.current = redirect;
      }
      logoutUser.mutate(undefined);
    },
    [logoutUser],
  );

  const userQuery = useGetUserQuery({ enabled: !!(token ?? '') });

  const login = (data: t.TLoginUser) => {
    loginUser.mutate(data);
  };

  const silentRefresh = useCallback(() => {
    if (authConfig?.test === true) {
      console.log('Test mode. Skipping silent refresh.');
      return;
    }
    refreshToken.mutate(undefined, {
      onSuccess: (data: t.TRefreshTokenResponse | undefined) => {
        const { user, token = '' } = data ?? {};
        if (token) {
          setUserContext({ token, isAuthenticated: true, user });
        } else {
          console.log('Token is not present. User is not authenticated.');
          if (authConfig?.test === true) {
            return;
          }
          const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          const redirectTo = encodeURIComponent(currentPath || '/');
          navigate(`/login?redirect_to=${redirectTo}`);
        }
      },
      onError: (error) => {
        console.log('refreshToken mutation error:', error);
        if (authConfig?.test === true) {
          return;
        }
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const redirectTo = encodeURIComponent(currentPath || '/');
        navigate(`/login?redirect_to=${redirectTo}`);
      },
    });
  }, []);

  useEffect(() => {
    if (userQuery.data) {
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      doSetError((userQuery.error as Error).message);
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const redirectTo = encodeURIComponent(currentPath || '/');
      navigate(`/login?redirect_to=${redirectTo}`, { replace: true });
    }
    if (error != null && error && isAuthenticated) {
      doSetError(undefined);
    }
    if (token == null || !token || !isAuthenticated) {
      silentRefresh();
    }
  }, [
    token,
    isAuthenticated,
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    error,
    setUser,
    navigate,
    silentRefresh,
    setUserContext,
  ]);

  useEffect(() => {
    const handleTokenUpdate = (event) => {
      console.log('tokenUpdated event received event');
      const newToken = event.detail;
      setUserContext({
        token: newToken,
        isAuthenticated: true,
        user: user,
        // allow setUserContext to pick up any redirect_to or stored redirect
      });
    };

    window.addEventListener('tokenUpdated', handleTokenUpdate);

    return () => {
      window.removeEventListener('tokenUpdated', handleTokenUpdate);
    };
  }, [setUserContext, user]);

  // Make the provider update only when it should
  const memoedValue = useMemo(
    () => ({
      user,
      token,
      error,
      login,
      logout,
      setError,
      roles: {
        [SystemRoles.USER]: userRole,
        [SystemRoles.ADMIN]: adminRole,
      },
      isAuthenticated,
    }),

    [user, error, isAuthenticated, token, userRole, adminRole],
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

export { AuthContextProvider, useAuthContext, AuthContext };
