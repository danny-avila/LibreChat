import { useEffect, useMemo } from 'react';
import { EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { TConfig, TEndpointsConfig, TAgentsEndpoint } from 'librechat-data-provider';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { useGetEndpointsQuery } from '~/data-provider';
import VersionPanel from './Version/VersionPanel';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import MCPPanel from './MCPPanel';
import { Panel } from '~/common';

export default function AgentPanelSwitch() {
  return (
    <AgentPanelProvider>
      <AgentPanelSwitchWithContext />
    </AgentPanelProvider>
  );
}

function AgentPanelSwitchWithContext() {
  const { conversation } = useChatContext();
  const { activePanel, setCurrentAgentId } = useAgentPanelContext();

  // TODO: Implement MCP endpoint
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const agentsConfig = useMemo<TAgentsEndpoint | null>(() => {
    const config = endpointsConfig?.[EModelEndpoint.agents] ?? null;
    if (!config) return null;

    return {
      ...(config as TConfig),
      capabilities: Array.isArray(config.capabilities)
        ? config.capabilities.map((cap) => cap as unknown as AgentCapabilities)
        : ([] as AgentCapabilities[]),
    } as TAgentsEndpoint;
  }, [endpointsConfig]);

  useEffect(() => {
    const agent_id = conversation?.agent_id ?? '';
    if (agent_id) {
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, conversation?.agent_id]);

  if (!conversation?.endpoint) {
    return null;
  }

  if (activePanel === Panel.actions) {
    return <ActionsPanel />;
  }
  if (activePanel === Panel.version) {
    return <VersionPanel />;
  }
  if (activePanel === Panel.mcp) {
    return <MCPPanel />;
  }
  return <AgentPanel agentsConfig={agentsConfig} endpointsConfig={endpointsConfig} />;
}
