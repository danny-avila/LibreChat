import { createContext, useContext } from 'react';
import useToolCallsMap from '~/hooks/Plugins/useToolCallsMap';
type ToolCallsMapContextType = ReturnType<typeof useToolCallsMap>;

export const ToolCallsMapContext = createContext<ToolCallsMapContextType>(
  {} as ToolCallsMapContextType,
);
export const useToolCallsMapContext = () => useContext(ToolCallsMapContext);

interface ToolCallsMapProviderProps {
  children: React.ReactNode;
  conversationId: string;
}

export function ToolCallsMapProvider({ children, conversationId }: ToolCallsMapProviderProps) {
  const toolCallsMap = useToolCallsMap({ conversationId });

  return (
    <ToolCallsMapContext.Provider value={toolCallsMap}>{children}</ToolCallsMapContext.Provider>
  );
}
