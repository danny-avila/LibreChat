import { useMemo } from 'react';
import { Tools } from 'librechat-data-provider';
import { useGetAgentByIdQuery } from '~/data-provider';
import { useAgentsMapContext } from '~/Providers';

interface AgentToolPermissionsResult {
  fileSearchAllowedByAgent: boolean;
  codeAllowedByAgent: boolean;
  tools: string[] | undefined;
}

/**
 * Hook to determine whether specific tools are allowed for a given agent.
 *
 * @param agentId - The ID of the agent. If null/undefined/empty, returns true for all tools (ephemeral agent behavior)
 * @returns Object with boolean flags for file_search and execute_code permissions, plus the tools array
 */
export default function useAgentToolPermissions(
  agentId: string | null | undefined,
): AgentToolPermissionsResult {
  const agentsMap = useAgentsMapContext();

  // Get the agent from the map if available
  const selectedAgent = useMemo(() => {
    return agentId != null && agentId !== '' ? agentsMap?.[agentId] : undefined;
  }, [agentId, agentsMap]);

  // Query for agent data from the API
  const { data: agentData } = useGetAgentByIdQuery(agentId ?? '', {
    enabled: !!agentId,
  });

  // Get tools from either the API data or the agents map
  const tools = useMemo(
    () =>
      (agentData?.tools as string[] | undefined) || (selectedAgent?.tools as string[] | undefined),
    [agentData?.tools, selectedAgent?.tools],
  );

  // Determine if file_search is allowed
  const fileSearchAllowedByAgent = useMemo(() => {
    // If no agentId, allow for ephemeral agents
    if (!agentId) return true;
    // If agentId exists but agent not found, disallow
    if (!selectedAgent) return false;
    // Check if the agent has the file_search tool
    return tools?.includes(Tools.file_search) ?? false;
  }, [agentId, selectedAgent, tools]);

  // Determine if execute_code is allowed
  const codeAllowedByAgent = useMemo(() => {
    // If no agentId, allow for ephemeral agents
    if (!agentId) return true;
    // If agentId exists but agent not found, disallow
    if (!selectedAgent) return false;
    // Check if the agent has the execute_code tool
    return tools?.includes(Tools.execute_code) ?? false;
  }, [agentId, selectedAgent, tools]);

  return {
    fileSearchAllowedByAgent,
    codeAllowedByAgent,
    tools,
  };
}
