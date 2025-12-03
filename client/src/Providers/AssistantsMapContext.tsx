import { createContext, useContext } from 'react';
import { useAssistantsMap } from '~/hooks/Assistants';
type AssistantsMapContextType = ReturnType<typeof useAssistantsMap>;

export const AssistantsMapContext = createContext<AssistantsMapContextType>(
  {} as AssistantsMapContextType,
);
export const useAssistantsMapContext = () => useContext(AssistantsMapContext);
