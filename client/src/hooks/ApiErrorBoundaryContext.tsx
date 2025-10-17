import { TError } from 'librechat-data-provider';
import React, { useState } from 'react';

type ProviderValue = {
  error?: TError;
  setError: React.Dispatch<React.SetStateAction<boolean>>;
};
const ApiErrorBoundaryContext = React.createContext<ProviderValue | undefined>(undefined);

export const ApiErrorBoundaryProvider = ({
  value,
  children,
}: {
  value: ProviderValue;
  children: React.ReactNode;
}) => {
  const [error, setError] = useState(false);
  return (
    <ApiErrorBoundaryContext.Provider value={value ?? { error, setError }}>
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
