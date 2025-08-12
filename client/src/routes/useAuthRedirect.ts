import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();

  const publicMode = (window as any).__NO_AUTH_MODE__ === true || import.meta.env.VITE_NO_AUTH_MODE === 'true';

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated && !publicMode) {
        navigate('/login', { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, publicMode]);

  return {
    user,
    isAuthenticated: publicMode ? true : isAuthenticated,
  };
}
