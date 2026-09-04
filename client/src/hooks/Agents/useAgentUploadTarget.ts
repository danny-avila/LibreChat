import { useMemo } from 'react';
import {
  isAgentsEndpoint,
  resolveEndpointType,
  resolveUseResponsesApi,
} from 'librechat-data-provider';
import type { EModelEndpoint, TConversation } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetAgentByIdQuery } from '~/data-provider';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';

export interface AgentUploadTarget {
  /** The saved agent's provider, which is the endpoint uploads are validated under. */
  agentProvider: string | undefined;
  endpointType: EModelEndpoint | string | undefined;
  useResponsesApi: boolean | undefined;
}

/**
 * One answer to what a conversation's agent uploads under, for every entry point that
 * needs it: the attach menu, drag and drop, and the upload handler itself.
 *
 * The agents map can be missing a saved agent on a direct-link or cache-miss load, so the
 * record is fetched when the map has no parameters for it. Reading the map alone leaves
 * those loads preflighting against the generic `agents` limits with no Responses flag.
 */
export default function useAgentUploadTarget(
  conversation: TConversation | null | undefined,
): AgentUploadTarget {
  const agentsMap = useAgentsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpoint = conversation?.endpoint;
  const agentId = conversation?.agent_id;
  const isAgents = useMemo(() => isAgentsEndpoint(endpoint), [endpoint]);

  const needsAgentFetch = useMemo(() => {
    if (!isAgents || agentId == null || agentId === '') {
      return false;
    }
    return !agentsMap?.[agentId]?.model_parameters;
  }, [isAgents, agentId, agentsMap]);

  const { data: agentData } = useGetAgentByIdQuery(agentId, { enabled: needsAgentFetch });

  const agentProvider = useMemo(() => {
    if (!isAgents || agentId == null || agentId === '') {
      return undefined;
    }
    return agentData?.provider ?? agentsMap?.[agentId]?.provider;
  }, [isAgents, agentId, agentData, agentsMap]);

  const endpointType = useMemo(
    () => resolveEndpointType(endpointsConfig, endpoint, agentProvider),
    [endpointsConfig, endpoint, agentProvider],
  );

  const useResponsesApi = useMemo(() => {
    if (!isAgents || agentId == null || agentId === '') {
      return conversation?.useResponsesApi;
    }
    return resolveUseResponsesApi(
      agentData?.model_parameters?.useResponsesApi ??
        agentsMap?.[agentId]?.model_parameters?.useResponsesApi,
      conversation?.useResponsesApi,
    );
  }, [isAgents, agentId, conversation?.useResponsesApi, agentData, agentsMap]);

  return { agentProvider, endpointType, useResponsesApi };
}
