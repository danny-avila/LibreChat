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
import { SystemRoles } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import {
  useGetRole,
  useGetUserQuery,
  useLogoutUserMutation,
} from '~/data-provider';
import { TAuthConfig, TUserContext, TAuthContext, TResError } from '~/common';
import useTimeout from '../useTimeout';
import store from '~/store';

const StripeAuthContext = createContext<TAuthContext | undefined>(undefined);

const StripeAuthContextProvider = ({
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
        setIsAuthenticated(isAuthenticated);

        // JWT token logic disabled for forwarded auth - always keep token undefined
        setToken(undefined);

        // Use a custom redirect if set
        const finalRedirect = logoutRedirectRef.current || redirect;
        // Clear the stored redirect
        logoutRedirectRef.current = undefined;

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

  const logout = useCallback(
    (redirect?: string) => {
      if (redirect) {
        logoutRedirectRef.current = redirect;
      }
      logoutUser.mutate(undefined);
    },
    [logoutUser],
  );

  // For forwarded auth - always try to get user data, auth is handled by proxy
  const userQuery = useGetUserQuery({ 
    enabled: true
  });

  const login = (data?: t.TLoginUser) => {
    // For forwarded auth - redirect to main app, authentication is handled by reverse proxy
    navigate('/c/new', { replace: true });
  };

  const silentRefresh = useCallback(() => {
    // No token refresh needed for forwarded auth
    return;
  }, []);

  useEffect(() => {
    if (userQuery.data) {
      // Log successful user data fetch
      console.log('[StripeAuthContext] User data fetched successfully:', {
        userData: {
          email: userQuery.data.email,
          username: userQuery.data.username,
        },
      });
      
      setUser(userQuery.data);
      setIsAuthenticated(true);
      if (error) {
        setError(undefined);
      }
    } else if (userQuery.isError) {
      // Log authentication failure
      console.log('[StripeAuthContext] User authentication failed:', {
        error: userQuery.error,
      });
      
      setIsAuthenticated(false);
      setUser(undefined);
    }
  }, [
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    error,
    setUser,
    doSetError,
  ]);

  // Make the provider update only when it should
  const memoedValue = useMemo(
    () => ({
      user,
      token, // Will be undefined for forwarded auth
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

  return <StripeAuthContext.Provider value={memoedValue}>{children}</StripeAuthContext.Provider>;
};

const useStripeAuthContext = () => {
  const context = useContext(StripeAuthContext);

  if (context === undefined) {
    throw new Error('useStripeAuthContext should be used inside StripeAuthContextProvider');
  }

  return context;
};

export { StripeAuthContextProvider, useStripeAuthContext, StripeAuthContext };