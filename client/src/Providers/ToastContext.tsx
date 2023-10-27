import { createContext } from 'react';
import type { TShowToast } from '~/common';
import { useToast } from '~/hooks';

type ToastContextType = {
  showToast: ({ message, severity, showIcon }: TShowToast) => void;
};

export const ToastContext = createContext<ToastContextType>({
  showToast: () => ({}),
});

export default function ToastProvider({ children }) {
  const { showToast } = useToast();

  return <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>;
}
