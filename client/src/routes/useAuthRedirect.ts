import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, roles, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        // Preserve intended destination (path + query + hash) when redirecting to login
        const currentPath = `${location.pathname}${location.search}${location.hash}`;
        // Avoid redirect loop from the login page itself
        if (location.pathname.startsWith('/login')) {
          navigate('/login', { replace: true });
          return;
        }
        const redirectTo = encodeURIComponent(currentPath || '/');
        navigate(`/login?redirect_to=${redirectTo}`, { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, location]);

  return {
    user,
    roles,
    isAuthenticated,
  };
}
