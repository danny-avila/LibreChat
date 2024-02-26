import { createContext, useContext } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { CreationForm } from '~/common';
import useCreationForm from './useCreationForm';

// type AssistantsContextType = {
//   // open: boolean;
//   // setOpen: Dispatch<SetStateAction<boolean>>;
//   form: UseFormReturn<CreationForm>;
// };
type AssistantsContextType = UseFormReturn<CreationForm>;

export const AssistantsContext = createContext<AssistantsContextType>({} as AssistantsContextType);

export function useAssistantsContext() {
  const context = useContext(AssistantsContext);

  if (context === undefined) {
    throw new Error('useAssistantsContext must be used within an AssistantsProvider');
  }

  return context;
}

export default function AssistantsProvider({ children }) {
  const hookValues = useCreationForm();

  return <AssistantsContext.Provider value={hookValues}>{children}</AssistantsContext.Provider>;
}
