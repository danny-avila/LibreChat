import { useState, useEffect, useMemo } from 'react';
import { Capabilities } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { ActionsEndpoint } from '~/common';
import type { Action, TConfig, TEndpointsConfig } from 'librechat-data-provider';
import { useGetActionsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import { Panel } from '~/common';

export default function AgentPanelSwitch() {
  const { conversation, index } = useChatContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(conversation?.agent_id);
  const { data: actions = [] } = useGetActionsQuery(conversation?.endpoint as ActionsEndpoint);
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const agentsConfig = useMemo(
    () =>
      // endpointsConfig?.[EModelEndpoint.agents] ??
      ({
        // for testing purposes
        capabilities: [Capabilities.tools, Capabilities.actions],
      } as TConfig),
    // [endpointsConfig]);
    [],
  );

  useEffect(() => {
    if (conversation?.agent_id) {
      setCurrentAgentId(conversation?.agent_id);
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
  };

  if (activePanel === Panel.actions) {
    return <ActionsPanel {...commonProps} />;
  }

  return (
    <AgentPanel {...commonProps} agentsConfig={agentsConfig} endpointsConfig={endpointsConfig} />
  );
}
