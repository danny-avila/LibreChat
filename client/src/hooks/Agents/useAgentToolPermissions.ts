import { useMemo } from 'react';
import { Tools, Constants } from 'librechat-data-provider';
import { useGetAgentByIdQuery } from '~/data-provider';
import { useAgentsMapContext } from '~/Providers';

interface AgentToolPermissionsResult {
  fileSearchAllowedByAgent: boolean;
  codeAllowedByAgent: boolean;
  tools: string[] | undefined;
}

function isEphemeralAgent(agentId: string | null | undefined): boolean {
  return agentId == null || agentId === '' || agentId === Constants.EPHEMERAL_AGENT_ID;
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

  const selectedAgent = useMemo(() => {
    return agentId != null && agentId !== '' ? agentsMap?.[agentId] : undefined;
  }, [agentId, agentsMap]);

  const { data: agentData } = useGetAgentByIdQuery(agentId);

  const tools = useMemo(
    () =>
      (agentData?.tools as string[] | undefined) || (selectedAgent?.tools as string[] | undefined),
    [agentData?.tools, selectedAgent?.tools],
  );

  const fileSearchAllowedByAgent = useMemo(() => {
    // Allow for ephemeral agents
    if (isEphemeralAgent(agentId)) return true;
    // If agentId exists but agent not found, disallow
    if (!selectedAgent) return false;
    // Check if the agent has the file_search tool
    return tools?.includes(Tools.file_search) ?? false;
  }, [agentId, selectedAgent, tools]);

  const codeAllowedByAgent = useMemo(() => {
    // Allow for ephemeral agents
    if (isEphemeralAgent(agentId)) return true;
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
