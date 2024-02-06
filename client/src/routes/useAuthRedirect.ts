import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '~/zustand';

export default function useAuthRedirect() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated()) {
        navigate('/login', { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated(), navigate]);

  return {
    isAuthenticated,
  };
}
