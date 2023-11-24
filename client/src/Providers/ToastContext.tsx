import { createContext, useContext } from 'react';
import type { TShowToast } from '~/common';
import useToast from '~/hooks/useToast';

type ToastContextType = {
  showToast: ({ message, severity, showIcon, duration }: TShowToast) => void;
};

export const ToastContext = createContext<ToastContextType>({
  showToast: () => ({}),
});

export function useToastContext() {
  return useContext(ToastContext);
}

export default function ToastProvider({ children }) {
  const { showToast } = useToast();

  return <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>;
}
