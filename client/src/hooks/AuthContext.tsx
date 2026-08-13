import {
  useRef,
  useMemo,
  useState,
  useEffect,
  useContext,
  useCallback,
  createContext,
} from 'react';
import { debounce } from 'lodash';
import { useNavigate } from 'react-router-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import {
  apiBaseUrl,
  SystemRoles,
  setTokenHeader,
  isSystemRoleName,
  buildLoginRedirectUrl,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useGetRole,
  useGetUserQuery,
  useClerkLoginMutation,
  useLoginUserMutation,
  useLogoutUserMutation,
  useRefreshTokenMutation,
} from '~/data-provider';
import { TAuthConfig, TUserContext, TAuthContext, TResError } from '~/common';
import { SESSION_KEY, isSafeRedirect, getPostLoginRedirect } from '~/utils';
import useLocalize from './useLocalize';
import useTimeout from './useTimeout';
import store from '~/store';

const AuthContext = (import.meta.hot?.data?.__AuthContext ??
  createContext<TAuthContext | undefined>(undefined)) as React.Context<TAuthContext | undefined>;
if (import.meta.hot) {
  import.meta.hot.data.__AuthContext = AuthContext;
}

export type ClerkSessionContextValue = {
  sessionId: string | null;
  signOut: (options: { sessionId: string }) => Promise<void>;
};

const ClerkSessionContext = createContext<ClerkSessionContextValue | undefined>(undefined);

function getLoginRedirectPath(): string {
  const redirectTo = new URLSearchParams(window.location.search).get('redirect_to');
  if (redirectTo && isSafeRedirect(redirectTo)) {
    return `/login?redirect_to=${encodeURIComponent(redirectTo)}`;
  }
  return buildLoginRedirectUrl();
}

const ClerkSessionProvider = ({
  value,
  children,
}: {
  value?: ClerkSessionContextValue;
  children: ReactNode;
}) => <ClerkSessionContext.Provider value={value}>{children}</ClerkSessionContext.Provider>;

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const isExternalRedirectRef = useRef(false);
  const clerkSession = useContext(ClerkSessionContext);
  const [user, setUser] = useRecoilState(store.user);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);
  const localize = useLocalize();

  const userRoleName = user?.role ?? '';
  const isCustomRole = isAuthenticated && !!user?.role && !isSystemRoleName(user.role);

  const { data: userRole = null } = useGetRole(SystemRoles.USER, {
    enabled: !!(isAuthenticated && (user?.role ?? '')),
  });
  const { data: adminRole = null } = useGetRole(SystemRoles.ADMIN, {
    enabled: !!(isAuthenticated && user?.role === SystemRoles.ADMIN),
  });
  const { data: customRole = null } = useGetRole(isCustomRole ? userRoleName : '_', {
    enabled: isCustomRole,
  });

  const navigate = useNavigate();

  const setUserContext = useMemo(
    () =>
      debounce((userContext: TUserContext) => {
        const { token, isAuthenticated, user, redirect } = userContext;
        setUser(user);
        setToken(token);
        setTokenHeader(token);
        setIsAuthenticated(isAuthenticated);
        if (isAuthenticated) {
          isExternalRedirectRef.current = false;
          setQueriesEnabled(true);
        }

        const searchParams = new URLSearchParams(window.location.search);
        const postLoginRedirect = getPostLoginRedirect(searchParams);

        const finalRedirect =
          postLoginRedirect ?? (redirect && isSafeRedirect(redirect) ? redirect : null);

        if (finalRedirect == null) {
          return;
        }

        navigate(finalRedirect, { replace: true });
      }, 50),
    [navigate, setUser, setQueriesEnabled],
  );
  const doSetError = useTimeout({ callback: (error) => setError(error as string | undefined) });

  const handleLoginSuccess = useCallback(
    (data: t.TLoginResponse | t.TClerkLoginResponse) => {
      if (data.twoFAPending === true) {
        navigate(`/login/2fa?tempToken=${data.tempToken}`, { replace: true });
        return;
      }
      setError(undefined);
      setUserContext({
        token: data.token,
        isAuthenticated: true,
        user: data.user,
        redirect: '/c/new',
      });
    },
    [navigate, setUserContext],
  );

  const { mutate: mutateLogin } = useLoginUserMutation({
    onSuccess: handleLoginSuccess,
    onError: (error: TResError | unknown) => {
      const resError = error as TResError;
      doSetError(resError.message);
      navigate(getLoginRedirectPath(), { replace: true });
    },
  });
  const { mutateAsync: mutateClerkLogin } = useClerkLoginMutation();
  const { mutateAsync: mutateLogout } = useLogoutUserMutation();
  const refreshToken = useRefreshTokenMutation();

  const loginWithClerk = useCallback(
    async (clerkToken: string): Promise<t.TClerkLoginResponse> => {
      const response = await mutateClerkLogin({ clerkToken });
      handleLoginSuccess(response);
      return response;
    },
    [handleLoginSuccess, mutateClerkLogin],
  );

  const clearLocalAuth = useCallback(() => {
    setUser(undefined);
    setToken(undefined);
    setTokenHeader(undefined);
    setIsAuthenticated(false);
    setQueriesEnabled(false);
  }, [setQueriesEnabled, setUser]);

  const clerkSessionId = clerkSession?.sessionId;
  const clerkSignOut = clerkSession?.signOut;
  const logout = useCallback(
    async (redirect?: string): Promise<void> => {
      isExternalRedirectRef.current = true;
      const localLogout = Promise.resolve().then(() => mutateLogout(undefined));
      const clerkLogout =
        clerkSessionId && clerkSignOut
          ? Promise.resolve().then(() => clerkSignOut({ sessionId: clerkSessionId }))
          : Promise.resolve();
      const [localResult, clerkResult] = await Promise.allSettled([localLogout, clerkLogout]);

      clearLocalAuth();

      if (localResult.status === 'rejected' || clerkResult.status === 'rejected') {
        doSetError(localize('com_auth_error_oauth_failed'));
        navigate('/login', { replace: true });
        return;
      }

      if (localResult.value.redirect) {
        window.location.replace(localResult.value.redirect);
        return;
      }

      const destination = redirect && isSafeRedirect(redirect) ? redirect : '/login';
      navigate(destination, { replace: true });
    },
    [clearLocalAuth, clerkSessionId, clerkSignOut, doSetError, localize, mutateLogout, navigate],
  );

  const userQuery = useGetUserQuery({ enabled: !!(token ?? '') });

  const login = useCallback((data: t.TLoginUser) => mutateLogin(data), [mutateLogin]);

  const silentRefresh = useCallback(() => {
    if (authConfig?.test === true) {
      console.log('Test mode. Skipping silent refresh.');
      return;
    }
    if (isExternalRedirectRef.current) {
      return;
    }
    refreshToken.mutate(undefined, {
      onSuccess: (data: t.TRefreshTokenResponse | undefined) => {
        if (isExternalRedirectRef.current) {
          return;
        }
        const { user, token = '' } = data ?? {};
        if (token) {
          const storedRedirect = sessionStorage.getItem(SESSION_KEY);
          sessionStorage.removeItem(SESSION_KEY);
          const baseUrl = apiBaseUrl();
          const rawPath = window.location.pathname;
          const strippedPath =
            baseUrl && (rawPath === baseUrl || rawPath.startsWith(baseUrl + '/'))
              ? rawPath.slice(baseUrl.length) || '/'
              : rawPath;
          const currentUrl = `${strippedPath}${window.location.search}`;
          const fallbackRedirect = isSafeRedirect(currentUrl) ? currentUrl : '/c/new';
          const redirect =
            storedRedirect && isSafeRedirect(storedRedirect) ? storedRedirect : fallbackRedirect;
          setUserContext({ user, token, isAuthenticated: true, redirect });
          return;
        }
        console.log('Token is not present. User is not authenticated.');
        if (authConfig?.test === true) {
          return;
        }
        navigate(getLoginRedirectPath());
      },
      onError: (error) => {
        if (isExternalRedirectRef.current) {
          return;
        }
        console.log('refreshToken mutation error:', error);
        if (authConfig?.test === true) {
          return;
        }
        navigate(getLoginRedirectPath());
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are stable at mount; adding refreshToken causes infinite re-fire
  }, []);

  useEffect(() => {
    if (isExternalRedirectRef.current) {
      return;
    }
    if (userQuery.data) {
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      doSetError((userQuery.error as Error).message);
      navigate(buildLoginRedirectUrl(), { replace: true });
    }
    if (error != null && error && isAuthenticated) {
      doSetError(undefined);
    }
    if (token == null || !token || !isAuthenticated) {
      silentRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- legacy useTimeout returns an unstable callback that would retrigger this effect
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
    const handleTokenUpdate = (event: CustomEvent<string>) => {
      console.log('tokenUpdated event received event');
      setUserContext({
        token: event.detail,
        isAuthenticated: true,
        user: user,
      });
    };

    window.addEventListener('tokenUpdated', handleTokenUpdate as EventListener);

    return () => {
      window.removeEventListener('tokenUpdated', handleTokenUpdate as EventListener);
    };
  }, [setUserContext, user]);

  const memoedValue = useMemo(
    () => ({
      user,
      token,
      error,
      login,
      loginWithClerk,
      logout,
      setError,
      roles: {
        [SystemRoles.USER]: userRole,
        [SystemRoles.ADMIN]: adminRole,
        ...(isCustomRole && customRole ? { [userRoleName]: customRole } : {}),
      },
      isAuthenticated,
    }),

    [
      user,
      error,
      isAuthenticated,
      token,
      userRole,
      adminRole,
      isCustomRole,
      userRoleName,
      customRole,
      login,
      loginWithClerk,
      logout,
    ],
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

export { AuthContextProvider, ClerkSessionProvider, useAuthContext, AuthContext };
