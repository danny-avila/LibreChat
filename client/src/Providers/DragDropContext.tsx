import React, { createContext, useContext, useMemo } from 'react';
import { isAgentsEndpoint, resolveEndpointType } from 'librechat-data-provider';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetAgentByIdQuery } from '~/data-provider';
import useImageCapability from '~/hooks/Files/useImageCapability';
import { useAgentsMapContext } from './AgentsMapContext';
import { useChatContext } from './ChatContext';

interface DragDropContextValue {
  conversationId: string | null | undefined;
  agentId: string | null | undefined;
  endpoint: string | null | undefined;
  endpointType?: EModelEndpoint | string | undefined;
  useResponsesApi?: boolean;
  /** True only when the active model is confidently non-image-capable. */
  confidentlyNonVision?: boolean;
}

const DragDropContext = createContext<DragDropContextValue | undefined>(undefined);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const agentsMap = useAgentsMapContext();

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

  const agentProvider = useMemo(() => {
    const isAgents = isAgentsEndpoint(conversation?.endpoint);
    if (!isAgents || !conversation?.agent_id) {
      return undefined;
    }
    return agentData?.provider ?? agentsMap?.[conversation.agent_id]?.provider;
  }, [conversation?.endpoint, conversation?.agent_id, agentData, agentsMap]);

  const endpointType = useMemo(
    () => resolveEndpointType(endpointsConfig, conversation?.endpoint, agentProvider),
    [endpointsConfig, conversation?.endpoint, agentProvider],
  );

  const useResponsesApi = useMemo(() => {
    const isAgents = isAgentsEndpoint(conversation?.endpoint);
    if (!isAgents || !conversation?.agent_id || conversation?.useResponsesApi !== undefined) {
      return conversation?.useResponsesApi;
    }
    return (
      agentData?.model_parameters?.useResponsesApi ??
      agentsMap?.[conversation.agent_id]?.model_parameters?.useResponsesApi
    );
  }, [
    conversation?.endpoint,
    conversation?.agent_id,
    conversation?.useResponsesApi,
    agentData,
    agentsMap,
  ]);

  /**
   * For saved agents `conversation.model` is cleared; the model lives on the
   * agent, either under `model_parameters.model` or the schema's top-level
   * `model`. Mirror `useAgentToolPermissions`' fallback chain so a saved
   * text-only agent is recognized (not treated as unknown/permissive).
   */
  const activeModel = useMemo(() => {
    const isAgents = isAgentsEndpoint(conversation?.endpoint);
    if (isAgents && conversation?.agent_id) {
      return (
        agentData?.model_parameters?.model ??
        agentData?.model ??
        agentsMap?.[conversation.agent_id]?.model_parameters?.model ??
        agentsMap?.[conversation.agent_id]?.model ??
        conversation?.model
      );
    }
    return conversation?.model;
  }, [conversation?.endpoint, conversation?.agent_id, conversation?.model, agentData, agentsMap]);

  const { confidentlyNonVision } = useImageCapability({
    model: activeModel,
    spec: conversation?.spec,
  });

  /** Context value only created when conversation fields change */
  const contextValue = useMemo<DragDropContextValue>(
    () => ({
      conversationId: conversation?.conversationId,
      agentId: conversation?.agent_id,
      endpoint: conversation?.endpoint,
      endpointType: endpointType,
      useResponsesApi: useResponsesApi,
      confidentlyNonVision,
    }),
    [
      conversation?.conversationId,
      conversation?.agent_id,
      conversation?.endpoint,
      useResponsesApi,
      endpointType,
      confidentlyNonVision,
    ],
  );

  return <DragDropContext.Provider value={contextValue}>{children}</DragDropContext.Provider>;
}

const defaultDragDropValue: DragDropContextValue = {
  conversationId: undefined,
  agentId: undefined,
  endpoint: undefined,
  endpointType: undefined,
  useResponsesApi: undefined,
  confidentlyNonVision: undefined,
};

export function useDragDropContext() {
  return useContext(DragDropContext) ?? defaultDragDropValue;
}
