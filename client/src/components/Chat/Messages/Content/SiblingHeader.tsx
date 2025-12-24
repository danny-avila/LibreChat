import { useMemo } from 'react';
import { EModelEndpoint, parseEphemeralAgentId, stripAgentIdSuffix } from 'librechat-data-provider';
import type { TMessage, Agent } from 'librechat-data-provider';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';

type SiblingHeaderProps = {
  /** The agentId from the content part (could be real agent ID or endpoint__model format) */
  agentId?: string;
};

/**
 * Header component for sibling content parts in parallel agent responses.
 * Displays the agent/model icon and name for each parallel response.
 */
export default function SiblingHeader({ agentId }: SiblingHeaderProps) {
  const agentsMap = useAgentsMapContext();

  const { displayName, displayEndpoint, displayModel, agent } = useMemo(() => {
    // First, try to look up as a real agent
    if (agentId) {
      // Strip ____N suffix if present (used to distinguish parallel agents with same ID)
      const baseAgentId = stripAgentIdSuffix(agentId);

      const foundAgent = agentsMap?.[baseAgentId] as Agent | undefined;
      if (foundAgent) {
        return {
          displayName: foundAgent.name,
          displayEndpoint: EModelEndpoint.agents,
          displayModel: foundAgent.model,
          agent: foundAgent,
        };
      }

      // Try to parse as ephemeral agent ID (endpoint__model___sender format)
      const parsed = parseEphemeralAgentId(agentId);
      if (parsed) {
        return {
          displayName: parsed.sender || parsed.model || 'AI',
          displayEndpoint: parsed.endpoint,
          displayModel: parsed.model,
          agent: undefined,
        };
      }

      // agentId exists but couldn't be parsed as ephemeral - use it as-is for display
      return {
        displayName: baseAgentId,
        displayEndpoint: EModelEndpoint.agents,
        displayModel: undefined,
        agent: undefined,
      };
    }

    // Use message model/endpoint as last resort
    return {
      displayName: 'Agent',
      displayEndpoint: EModelEndpoint.agents,
      displayModel: undefined,
      agent: undefined,
    };
  }, [agentId, agentsMap]);

  return (
    <div className="mb-2 flex items-center gap-2 border-b border-border-light pb-2">
      <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
        <MessageIcon
          message={
            {
              endpoint: displayEndpoint,
              model: displayModel,
              isCreatedByUser: false,
            } as TMessage
          }
          agent={agent || undefined}
        />
      </div>
      <span className="text-sm font-medium text-text-primary">{displayName}</span>
    </div>
  );
}
