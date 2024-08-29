import { createContext, useContext } from 'react';
import { useAgentsMap } from '~/hooks/Agents';
type AgentsMapContextType = ReturnType<typeof useAgentsMap>;

export const AgentsMapContext = createContext<AgentsMapContextType>({} as AgentsMapContextType);
export const useAgentsMapContext = () => useContext(AgentsMapContext);