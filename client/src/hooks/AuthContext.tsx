import {
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useCallback,
  createContext,
  useContext
} from 'react';
import {
  TUser,
  TLoginResponse,
  setTokenHeader,
  useLoginUserMutation,
  useLogoutUserMutation,
  useGetUserQuery,
  refreshToken,
  TLoginUser
} from '@librechat/data-provider';
import { useNavigate } from 'react-router-dom';

export type TAuthContext = {
  user: TUser | undefined;
  token: string | undefined;
  isAuthenticated: boolean;
  error: string | undefined;
  login: (data: TLoginUser) => void;
  logout: () => void;
};

export type TUserContext = {
  user?: TUser | undefined;
  token: string | undefined;
  isAuthenticated: boolean;
  redirect?: string;
};

export type TAuthConfig = {
  loginRedirect: string;
};
//@ts-ignore - index expression is not of type number
window['errorTimeout'] = undefined;
const AuthContext = createContext<TAuthContext | undefined>(undefined);

const AuthContextProvider = ({
  authConfig,
  children
}: {
  authConfig: TAuthConfig;
  children: ReactNode;
}) => {
  const [user, setUser] = useState<TUser | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const navigate = useNavigate();

  const loginUser = useLoginUserMutation();
  const logoutUser = useLogoutUserMutation();
  const userQuery = useGetUserQuery({ enabled: !!token });

  // This seems to prevent the error flashing issue
  const doSetError = (error: string | undefined) => {
    if (error) {
      console.log(error);
      // set timeout to ensure we don't get a flash of the error message
      window['errorTimeout'] = setTimeout(() => {
        setError(error);
      }, 400);
    }
  };

    function parseJwt(token) {
      try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
              atob(base64)
                  .split('')
                  .map(function (c) {
                      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                  })
                  .join('')
          );
          return JSON.parse(jsonPayload);
      } catch (error) {
          return null;
      }
  };

  function isTokenExpired(token) {
      const parsedToken = parseJwt(token);
      if (!parsedToken) {
          return true;
      }
      const expirationDate = new Date(parsedToken.exp * 1000);
      if (expirationDate < new Date()) {
          return true;
      }
      return false;
  };
  
  const setUserContext = useCallback(
    (userContext: TUserContext) => {
      const { token, isAuthenticated, user, redirect } = userContext;
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
    [navigate]
  );

  const getCookieValue = (key: string) => {
    let keyValue = document.cookie.match('(^|;) ?' + key + '=([^;]*)(;|$)');
    return keyValue ? keyValue[2] : null;
  };

  const login = (data: TLoginUser) => {
    loginUser.mutate(data, {
      onSuccess: (data: TLoginResponse) => {
        const { user, token } = data;
        setUserContext({ token, isAuthenticated: true, user, redirect: '/chat/new' });
      },
      onError: (error) => {
        doSetError((error as Error).message);
        navigate('/login', { replace: true });
      }
    });
  };

  const logout = () => {
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
    logoutUser.mutate(undefined, {
      onSuccess: () => {
        setUserContext({
          token: undefined,
          isAuthenticated: false,
          user: undefined,
          redirect: '/login'
        });
      },
      onError: (error) => {
        doSetError((error as Error).message);
      }
    });
  };

  useEffect(() => {
    const checkRefreshToken = async () => {
      try {
        const response = await refreshToken();
        if (response.status === 200) {
          setUserContext({ token: response.data.token, isAuthenticated: true, user: response.data.user });
        } else {
          navigate('/login', { replace: true });
        }
      } catch (error) {
        // doSetError((error as Error).message);
        navigate('/login', { replace: true });
      }
    };

    if (!token || isTokenExpired(token)) {
      checkRefreshToken();
    } else if (userQuery.data) {
      setUser(userQuery.data);
    } else if (userQuery.isError) {
      doSetError((userQuery?.error as Error).message);
      navigate('/login', { replace: true });
    }
    if (error && isAuthenticated) {
      doSetError(undefined);
    }
    if (!token || !isAuthenticated) {
      const tokenFromCookie = getCookieValue('token');
      if (tokenFromCookie) {
        setUserContext({ token: tokenFromCookie, isAuthenticated: true, user: userQuery.data });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [
    token,
    isAuthenticated,
    userQuery.data,
    userQuery.isError,
    userQuery.error,
    error,
    navigate,
    setUserContext
  ]);

  // Make the provider update only when it should
  const memoedValue = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      error,
      login,
      logout
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, error, isAuthenticated, token]
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
