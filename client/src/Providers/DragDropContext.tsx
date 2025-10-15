import React, { createContext, useContext, useMemo } from 'react';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { getEndpointField } from '~/utils/endpoints';
import { useChatContext } from './ChatContext';

interface DragDropContextValue {
  conversationId: string | null | undefined;
  agentId: string | null | undefined;
  endpoint: string | null | undefined;
  endpointType?: EModelEndpoint | undefined;
}

const DragDropContext = createContext<DragDropContextValue | undefined>(undefined);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(() => {
    return (
      getEndpointField(endpointsConfig, conversation?.endpoint, 'type') ||
      (conversation?.endpoint as EModelEndpoint | undefined)
    );
  }, [conversation?.endpoint, endpointsConfig]);

  /** Context value only created when conversation fields change */
  const contextValue = useMemo<DragDropContextValue>(
    () => ({
      conversationId: conversation?.conversationId,
      agentId: conversation?.agent_id,
      endpoint: conversation?.endpoint,
      endpointType: endpointType,
    }),
    [conversation?.conversationId, conversation?.agent_id, conversation?.endpoint, endpointType],
  );

  return <DragDropContext.Provider value={contextValue}>{children}</DragDropContext.Provider>;
}

export function useDragDropContext() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDropContext must be used within DragDropProvider');
  }
  return context;
}
