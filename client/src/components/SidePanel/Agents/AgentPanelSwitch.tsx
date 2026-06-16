import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { Panel, isEphemeralAgent } from '~/common';
import VersionPanel from './Version/VersionPanel';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import store from '~/store';

export default function AgentPanelSwitch({ noPadding = false }: { noPadding?: boolean }) {
  return (
    <AgentPanelProvider>
      <AgentPanelSwitchWithContext noPadding={noPadding} />
    </AgentPanelProvider>
  );
}

function AgentPanelSwitchWithContext({ noPadding }: { noPadding?: boolean }) {
  const { activePanel, setCurrentAgentId } = useAgentPanelContext();
  const agentId = useRecoilValue(store.conversationAgentIdByIndex(0));

  useEffect(() => {
    const agent_id = agentId ?? '';
    if (!isEphemeralAgent(agent_id)) {
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, agentId]);

  if (activePanel === Panel.actions) {
    return <ActionsPanel />;
  }
  if (activePanel === Panel.version) {
    return <VersionPanel />;
  }
  return <AgentPanel noPadding={noPadding} />;
}
