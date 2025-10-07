import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginPage } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated) {
        // Use window.location instead of navigate to ensure proper base path handling
        window.location.href = loginPage();
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate]);

  return {
    user,
    isAuthenticated,
  };
}
