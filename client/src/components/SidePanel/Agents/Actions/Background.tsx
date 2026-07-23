import { useMemo } from 'react';
import { AuthTypeEnum, actionDelimiter } from 'librechat-data-provider';
import { useAgentCapabilities, useGetAgentsConfig } from '~/hooks';
import { useGetExpandedAgentByIdQuery } from '~/data-provider';
import { useAgentPanelContext } from '~/Providers';
import { isEphemeralAgent } from '~/common';
import Background from '../Background';

/** "Background execution" switch for a saved action — opts every operation of
 *  the action into background dispatch via `tool_options`. Hidden for OAuth
 *  actions: their calls can block on an interactive login prompt that a
 *  detached run could never surface (the server excludes them regardless). */
export default function ActionBackground({ agentId }: { agentId: string }) {
  const { action } = useAgentPanelContext();
  const { agentsConfig } = useGetAgentsConfig();
  const { backgroundToolsEnabled } = useAgentCapabilities(agentsConfig?.capabilities);
  const { data: agent } = useGetExpandedAgentByIdQuery(agentId, {
    enabled: backgroundToolsEnabled && action != null && !isEphemeralAgent(agentId),
  });

  /** The agent's `actions` entries are `${encodedDomain}_action_${action_id}`,
   *  so the saved encoded domain is recoverable without re-implementing the
   *  server's domain encoding; operation tool ids share that domain suffix. */
  const actionToolIds = useMemo(() => {
    const actionId = action?.action_id;
    if (!actionId || !agent) {
      return [];
    }
    let domain = '';
    for (const entry of agent.actions ?? []) {
      const idx = entry.indexOf(actionDelimiter);
      if (idx > 0 && entry.slice(idx + actionDelimiter.length) === actionId) {
        domain = entry.slice(0, idx);
        break;
      }
    }
    if (!domain) {
      return [];
    }
    const suffix = `${actionDelimiter}${domain}`;
    return (agent.tools ?? []).filter((tool) => tool.endsWith(suffix));
  }, [action?.action_id, agent]);

  if (action?.metadata.auth?.type === AuthTypeEnum.OAuth) {
    return null;
  }

  return (
    <Background
      toolIds={actionToolIds}
      switchId="action-background-tools"
      labelKey="com_ui_tool_background"
      infoKey="com_nav_info_tool_background"
    />
  );
}
