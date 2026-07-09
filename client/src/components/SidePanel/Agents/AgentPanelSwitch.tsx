import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import AgentPanelSplash from '~/nj/components/Agents/AgentPanelSplash';
import { atomWithLocalStorage } from '~/store/utils';
import { Panel, isEphemeralAgent } from '~/common';
import VersionPanel from './Version/VersionPanel';
import AgentPanel from './AgentPanel';
import store from '~/store';

const showSplashPageState = atomWithLocalStorage('agentPanelSplashPage', true);

export default function AgentPanelSwitch() {
  return (
    <AgentPanelProvider>
      <AgentPanelSwitchWithContext />
    </AgentPanelProvider>
  );
}

function AgentPanelSwitchWithContext() {
  const { activePanel, setCurrentAgentId } = useAgentPanelContext();
  const agentId = useRecoilValue(store.conversationAgentIdByIndex(0));
  const [showSplashPage, setShowSplashPage] = useRecoilState(showSplashPageState);

  useEffect(() => {
    const agent_id = agentId ?? '';
    if (!isEphemeralAgent(agent_id)) {
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, agentId]);

  if (showSplashPage) {
    return <AgentPanelSplash setShowSplashPage={setShowSplashPage} />;
  }

  if (activePanel === Panel.version) {
    return <VersionPanel />;
  }
  return <AgentPanel />;
}
