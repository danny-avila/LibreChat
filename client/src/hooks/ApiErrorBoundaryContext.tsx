import React, { useState } from 'react';

export type ApiError = {
  error: any;
  setError: (error: any) => void;
};

const ApiErrorBoundaryContext = React.createContext<ApiError | undefined>(undefined);

export const ApiErrorBoundaryProvider = ({
  value,
  children,
}: {
  value?: ApiError;
  children: React.ReactNode;
}) => {
  const [error, setError] = useState(false);
  return (
    <ApiErrorBoundaryContext.Provider value={value ? value : { error, setError }}>
      {children}
    </ApiErrorBoundaryContext.Provider>
  );
};

export const useApiErrorBoundary = () => {
  const context = React.useContext(ApiErrorBoundaryContext);

  if (context === undefined) {
    throw new Error('useApiErrorBoundary must be used inside ApiErrorBoundaryProvider');
  }

  return context;
};
