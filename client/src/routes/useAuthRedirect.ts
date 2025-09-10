import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';

export default function useAuthRedirect() {
  const { user, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const { data: config, isLoading } = useGetStartupConfig();

  useEffect(() => {
    // Wait for startup config to load to know if auth is disabled
    if (isLoading) {
      return;
    }
    if (isAuthenticated || (config as any)?.authDisabled === true) {
      return;
    }
    const timeout = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, config, isLoading]);

  return {
    user,
    isAuthenticated,
  };
}
