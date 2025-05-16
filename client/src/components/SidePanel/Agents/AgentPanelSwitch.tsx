import { useState, useEffect, useMemo } from 'react';
import { EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { ActionsEndpoint } from '~/common';
import type { Action, TConfig, TEndpointsConfig, TAgentsEndpoint } from 'librechat-data-provider';
import { useGetActionsQuery, useGetEndpointsQuery, useCreateAgentMutation } from '~/data-provider';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import VersionPanel from './Version/VersionPanel';
import { Panel } from '~/common';

export default function AgentPanelSwitch() {
  const { conversation, index } = useChatContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(conversation?.agent_id);
  const { data: actions = [] } = useGetActionsQuery(conversation?.endpoint as ActionsEndpoint);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const createMutation = useCreateAgentMutation();

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
  }, [conversation?.agent_id]);

  if (!conversation?.endpoint) {
    return null;
  }

  const commonProps = {
    index,
    action,
    actions,
    setAction,
    activePanel,
    setActivePanel,
    setCurrentAgentId,
    agent_id: currentAgentId,
    createMutation,
  };

  if (activePanel === Panel.actions) {
    return <ActionsPanel {...commonProps} />;
  }

  if (activePanel === Panel.version) {
    return (
      <VersionPanel
        setActivePanel={setActivePanel}
        agentsConfig={agentsConfig}
        selectedAgentId={currentAgentId}
      />
    );
  }

  return (
    <AgentPanel {...commonProps} agentsConfig={agentsConfig} endpointsConfig={endpointsConfig} />
  );
}
