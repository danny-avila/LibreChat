import React from 'react';
import { useApiErrorBoundary } from '~/hooks/ApiErrorBoundaryContext';
import { useAuthContext } from '~/hooks/AuthContext';
import { useNavigate } from 'react-router-dom';

const ApiErrorWatcher = () => {
  const { error } = useApiErrorBoundary();
  const { logout } = useAuthContext();
 const navigate = useNavigate();
  React.useEffect(() => {
    if (error?.response?.status === 401) {
       const localStorageKeys = Object.keys(localStorage);
       localStorageKeys.forEach(key => {
         if (key.includes('token')) {
           localStorage.removeItem(key);
         }
       });
      navigate('/login');
    }
  }, [error, logout]);

  return null;
};

export default ApiErrorWatcher;
