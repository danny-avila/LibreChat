import React, { createContext, useContext, useMemo } from 'react';
import { getEndpointField, isAgentsEndpoint } from 'librechat-data-provider';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetAgentByIdQuery } from '~/data-provider';
import { useAgentsMapContext } from './AgentsMapContext';
import { useChatContext } from './ChatContext';

interface DragDropContextValue {
  conversationId: string | null | undefined;
  agentId: string | null | undefined;
  endpoint: string | null | undefined;
  endpointType?: EModelEndpoint | undefined;
  useResponsesApi?: boolean;
}

const DragDropContext = createContext<DragDropContextValue | undefined>(undefined);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const agentsMap = useAgentsMapContext();

  const endpointType = useMemo(() => {
    return (
      getEndpointField(endpointsConfig, conversation?.endpoint, 'type') ||
      (conversation?.endpoint as EModelEndpoint | undefined)
    );
  }, [conversation?.endpoint, endpointsConfig]);

  const needsAgentFetch = useMemo(() => {
    const isAgents = isAgentsEndpoint(conversation?.endpoint);
    if (!isAgents || !conversation?.agent_id) {
      return false;
    }
    const agent = agentsMap?.[conversation.agent_id];
    return !agent?.model_parameters;
  }, [conversation?.endpoint, conversation?.agent_id, agentsMap]);

  const { data: agentData } = useGetAgentByIdQuery(conversation?.agent_id, {
    enabled: needsAgentFetch,
  });

  const useResponsesApi = useMemo(() => {
    const isAgents = isAgentsEndpoint(conversation?.endpoint);
    if (!isAgents || !conversation?.agent_id || conversation?.useResponsesApi) {
      return conversation?.useResponsesApi;
    }
    const agent = agentData || agentsMap?.[conversation.agent_id];
    return agent?.model_parameters?.useResponsesApi;
  }, [
    conversation?.endpoint,
    conversation?.agent_id,
    conversation?.useResponsesApi,
    agentData,
    agentsMap,
  ]);

  /** Context value only created when conversation fields change */
  const contextValue = useMemo<DragDropContextValue>(
    () => ({
      conversationId: conversation?.conversationId,
      agentId: conversation?.agent_id,
      endpoint: conversation?.endpoint,
      endpointType: endpointType,
      useResponsesApi: useResponsesApi,
    }),
    [
      conversation?.conversationId,
      conversation?.agent_id,
      conversation?.endpoint,
      useResponsesApi,
      endpointType,
    ],
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
