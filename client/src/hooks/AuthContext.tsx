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
  clearTwoFactorSetupToken,
  persistTwoFactorSetupToken,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  isSafeRedirect,
  getPostLoginRedirect,
  clearPostLoginRedirect,
  persistRedirectToSession,
  isRequiredTwoFactorSetupRoute,
} from '~/utils';
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

const AuthContext = (import.meta.hot?.data?.__AuthContext ??
  createContext<TAuthContext | undefined>(undefined)) as React.Context<TAuthContext | undefined>;
if (import.meta.hot) {
  import.meta.hot.data.__AuthContext = AuthContext;
}

/**
 * Prefers the response's machine-readable code, because the mapping in `getLoginError` only sees
 * this string and several distinct failures share a status. Falls back to the thrown message.
 */
const getLoginErrorText = (error: TResError | unknown): string | undefined =>
  (error as { response?: { data?: { code?: string } } })?.response?.data?.code ??
  (error as TResError)?.message;

const AuthContextProvider = ({
  authConfig,
  children,
}: {
  authConfig?: TAuthConfig;
  children: ReactNode;
}) => {
  const isExternalRedirectRef = useRef(false);
  const [user, setUser] = useRecoilState(store.user);
  const logoutRedirectRef = useRef<string | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

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
          setQueriesEnabled(true);
        }

        const logoutRedirect = logoutRedirectRef.current;
        logoutRedirectRef.current = undefined;

        /** Callers resolve the post-login destination, so it is consumed exactly once per sign-in. */
        const finalRedirect =
          logoutRedirect ?? (redirect && isSafeRedirect(redirect) ? redirect : null);

        if (finalRedirect == null) {
          return;
        }

        navigate(finalRedirect, { replace: true });
      }, 50),
    [navigate, setUser, setQueriesEnabled],
  );
  const setErrorAfterTimeout = useCallback(
    (error: string | number | boolean | null) => setError(error as string | undefined),
    [],
  );
  const doSetError = useTimeout({ callback: setErrorAfterTimeout });

  const loginUser = useLoginUserMutation({
    onSuccess: (data: t.TLoginResponse) => {
      const { user, token, twoFAPending, twoFASetupRequired, tempToken } = data;
      if (twoFASetupRequired) {
        const redirectTo = new URLSearchParams(window.location.search).get('redirect_to');
        if (redirectTo) {
          persistRedirectToSession(redirectTo);
        }
        persistTwoFactorSetupToken(tempToken ?? '');
        navigate('/login/2fa/setup', { replace: true });
        return;
      }
      if (twoFAPending) {
        navigate(`/login/2fa?tempToken=${tempToken}`, { replace: true });
        return;
      }
      setError(undefined);
      const redirect =
        getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? '/c/new';
      setUserContext({ token, isAuthenticated: true, user, redirect });
    },
    onError: (error: TResError | unknown) => {
      doSetError(getLoginErrorText(error));
      // Preserve a valid redirect_to across login failures so the deep link survives retries.
      // Cannot use buildLoginRedirectUrl() here: it reads the current pathname (already /login)
      // and would return plain /login, dropping the redirect_to destination.
      const redirectTo = new URLSearchParams(window.location.search).get('redirect_to');
      const loginPath =
        redirectTo && isSafeRedirect(redirectTo)
          ? `/login?redirect_to=${encodeURIComponent(redirectTo)}`
          : '/login';
      navigate(loginPath, { replace: true });
    },
  });
  const logoutUser = useLogoutUserMutation({
    onSuccess: (data) => {
      if (data.redirect) {
        /** data.redirect is the IdP's end_session_endpoint URL — an absolute URL generated
         * server-side from trusted IdP metadata (not user input), so isSafeRedirect is bypassed.
         * setUserContext is debounced (50ms) and won't fire before page unload, so clear the
         * axios Authorization header synchronously to prevent in-flight requests. */
        isExternalRedirectRef.current = true;
        setTokenHeader(undefined);
        window.location.replace(data.redirect);
        return;
      }
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
  const refreshToken = useRefreshTokenMutation();

  const logout = useCallback(
    (redirect?: string) => {
      clearPostLoginRedirect();
      clearTwoFactorSetupToken();
      if (redirect) {
        logoutRedirectRef.current = redirect;
      }
      logoutUser.mutate(undefined);
    },
    [logoutUser],
  );

  const completeAuthentication = useCallback(
    (authenticatedToken: string, authenticatedUser: t.TUser) => {
      const redirect =
        getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? '/c/new';
      /** The enrollment credential has done its job; do not leave it live in the tab. */
      clearTwoFactorSetupToken();
      setUser(authenticatedUser);
      setToken(authenticatedToken);
      setTokenHeader(authenticatedToken);
      setIsAuthenticated(true);
      setQueriesEnabled(true);
      navigate(redirect, { replace: true });
    },
    [navigate, setQueriesEnabled, setUser],
  );

  /**
   * The enrollment hand-off normally replaces the document, which discards the session it is
   * redirecting away from. Where session storage is blocked it has to keep the document instead,
   * so this provider stays mounted and that session survives: the user query stays enabled and
   * navigates to the login page the moment it fails, taking the user off the very screen the
   * server is demanding they complete. Land on the state a replaced document would have left, and
   * leave the setup token alone, since the in-memory mirror is then its only copy.
   */
  const clearAuthenticationForRedirect = useCallback(() => {
    setUser(undefined);
    setToken(undefined);
    setIsAuthenticated(false);
  }, [setUser]);

  const userQuery = useGetUserQuery({ enabled: !!(token ?? '') });

  const login = useCallback(
    (data: t.TLoginUser) => {
      loginUser.mutate(data);
    },
    [loginUser],
  );

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
        const { user, token = '', twoFASetupRequired, tempToken } = data ?? {};
        if (twoFASetupRequired && tempToken) {
          persistTwoFactorSetupToken(tempToken);
          /**
           * Already on the setup route, reached by an enforcement redirect that parked the
           * destination in the query. Replacing the route again would drop that query, and the
           * route itself is not a safe redirect to bank, so enrollment would end at `/c/new`.
           */
          if (isRequiredTwoFactorSetupRoute()) {
            return;
          }
          const baseUrl = apiBaseUrl();
          const rawPath = window.location.pathname;
          const strippedPath =
            baseUrl && (rawPath === baseUrl || rawPath.startsWith(baseUrl + '/'))
              ? rawPath.slice(baseUrl.length) || '/'
              : rawPath;
          const currentUrl = `${strippedPath}${window.location.search}${window.location.hash}`;
          persistRedirectToSession(currentUrl);
          navigate('/login/2fa/setup', { replace: true });
          return;
        }
        if (token) {
          const baseUrl = apiBaseUrl();
          const rawPath = window.location.pathname;
          const strippedPath =
            baseUrl && (rawPath === baseUrl || rawPath.startsWith(baseUrl + '/'))
              ? rawPath.slice(baseUrl.length) || '/'
              : rawPath;
          const currentUrl = `${strippedPath}${window.location.search}`;
          const fallbackRedirect = isSafeRedirect(currentUrl) ? currentUrl : '/c/new';
          const redirect =
            getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? fallbackRedirect;
          setUserContext({ user, token, isAuthenticated: true, redirect });
          return;
        }
        console.log('Token is not present. User is not authenticated.');
        if (authConfig?.test === true) {
          return;
        }
        if (isRequiredTwoFactorSetupRoute()) {
          return;
        }
        navigate(buildLoginRedirectUrl());
      },
      onError: (error) => {
        if (isExternalRedirectRef.current) {
          return;
        }
        console.log('refreshToken mutation error:', error);
        if (authConfig?.test === true) {
          return;
        }
        if (isRequiredTwoFactorSetupRoute()) {
          return;
        }
        navigate(buildLoginRedirectUrl());
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
    doSetError,
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

  useEffect(() => {
    const handleAuthRedirect = (event: CustomEvent<{ inDocument?: boolean }>) => {
      if (event.detail?.inDocument !== true) {
        return;
      }
      clearAuthenticationForRedirect();
    };

    window.addEventListener('authRedirectStarted', handleAuthRedirect as EventListener);

    return () => {
      window.removeEventListener('authRedirectStarted', handleAuthRedirect as EventListener);
    };
  }, [clearAuthenticationForRedirect]);

  const memoedValue = useMemo(
    () => ({
      user,
      token,
      error,
      login,
      logout,
      completeAuthentication,
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
      logout,
      completeAuthentication,
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

export { AuthContextProvider, useAuthContext, AuthContext };
