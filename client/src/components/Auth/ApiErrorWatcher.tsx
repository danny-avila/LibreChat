import React from 'react';
import { useApiErrorBoundary } from '~/hooks/ApiErrorBoundaryContext';
import { useNavigate } from 'react-router-dom';

const ApiErrorWatcher = () => {
  const { error } = useApiErrorBoundary();
 const navigate = useNavigate();
  React.useEffect(() => {
    if (error?.response?.status === 401) {
      //  const localStorageKeys = Object.keys(localStorage);
      //  localStorageKeys.forEach(key => {
      //    if (key.includes('token')) {
      //      localStorage.removeItem(key);
      //    }
      //  });
      navigate('/login');
    }
  }, [error, navigate]);

  return null;
};

export default ApiErrorWatcher;
