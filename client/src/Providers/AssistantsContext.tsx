import { createContext, useContext } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { AssistantForm } from '~/common';
import useAssistantForm from './useAssistantForm';

type AssistantsContextType = UseFormReturn<AssistantForm>;

export const AssistantsContext = createContext<AssistantsContextType>({} as AssistantsContextType);

export function useAssistantsContext() {
  const context = useContext(AssistantsContext);

  if (context === undefined) {
    throw new Error('useAssistantsContext must be used within an AssistantsProvider');
  }

  return context;
}

export default function AssistantsProvider({ children }) {
  const hookValues = useAssistantForm();

  return <AssistantsContext.Provider value={hookValues}>{children}</AssistantsContext.Provider>;
}
