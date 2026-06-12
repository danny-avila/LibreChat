import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm, FormProvider } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { AgentPanelProvider, useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { Panel, isEphemeralAgent } from '~/common';
import VersionPanel from './Version/VersionPanel';
import { getDefaultAgentFormValues } from '~/utils';
import ActionsPanel from './ActionsPanel';
import AgentPanel from './AgentPanel';
import store from '~/store';

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

  /**
   * The agent form lives above the panel switch so unsaved form state
   * survives navigating to the Actions/Version panels and back. When it
   * lived inside AgentPanel, switching panels unmounted the form and
   * silently discarded everything the user had typed.
   */
  const methods = useForm<AgentForm>({
    defaultValues: getDefaultAgentFormValues(),
    mode: 'onChange',
  });

  useEffect(() => {
    const agent_id = agentId ?? '';
    if (!isEphemeralAgent(agent_id)) {
      setCurrentAgentId(agent_id);
    }
  }, [setCurrentAgentId, agentId]);

  if (activePanel === Panel.actions) {
    return (
      <FormProvider {...methods}>
        <ActionsPanel />
      </FormProvider>
    );
  }
  if (activePanel === Panel.version) {
    return (
      <FormProvider {...methods}>
        <VersionPanel />
      </FormProvider>
    );
  }
  return (
    <FormProvider {...methods}>
      <AgentPanel />
    </FormProvider>
  );
}
