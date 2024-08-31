import { useEffect, useMemo } from 'react';
import { EModelEndpoint, isAgentsEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { SwitcherProps, OptionWithIcon } from '~/common';
import { useSetIndexOptions, useSelectAgent, useLocalize } from '~/hooks';
import { useChatContext, useAgentsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';
import { Combobox } from '~/components/ui';

export default function AgentSwitcher({ isCollapsed }: SwitcherProps) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { index, conversation } = useChatContext();
  const { agent_id: selectedAgentId = null, endpoint } = conversation ?? {};

  const agentsMapResult = useAgentsMapContext();

  const agentsMap = useMemo(() => {
    return agentsMapResult ?? {};
  }, [agentsMapResult]);

  const { onSelect } = useSelectAgent();

  const agents: Agent[] = useMemo(() => {
    return Object.values(agentsMap) as Agent[];
  }, [agentsMap]);

  useEffect(() => {
    if (selectedAgentId == null && agents.length > 0) {
      let agent_id = localStorage.getItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`);
      if (agent_id == null) {
        agent_id = agents[0].id;
      }
      const agent = agentsMap[agent_id];

      if (agent !== undefined && isAgentsEndpoint(endpoint as string) === true) {
        setOption('model')('');
        setOption('agent_id')(agent_id);
      }
    }
  }, [index, agents, selectedAgentId, agentsMap, endpoint, setOption]);

  const currentAgent = agentsMap[selectedAgentId ?? ''];

  const agentOptions: OptionWithIcon[] = useMemo(
    () =>
      agents.map((agent: Agent) => {
        return {
          label: agent.name ?? '',
          value: agent.id,
          icon: (
            <Icon
              isCreatedByUser={false}
              endpoint={EModelEndpoint.agents}
              agentName={agent.name ?? ''}
              iconURL={agent.avatar?.filepath}
            />
          ),
        };
      }),
    [agents],
  );

  return (
    <Combobox
      selectedValue={currentAgent?.id ?? ''}
      displayValue={
        agents.find((agent: Agent) => agent.id === selectedAgentId)?.name ??
        localize('com_sidepanel_select_agent')
      }
      selectPlaceholder={localize('com_sidepanel_select_agent')}
      searchPlaceholder={localize('com_agents_search_name')}
      isCollapsed={isCollapsed}
      ariaLabel={'agent'}
      setValue={onSelect}
      items={agentOptions}
      SelectIcon={
        <Icon
          isCreatedByUser={false}
          endpoint={endpoint}
          agentName={currentAgent?.name ?? ''}
          iconURL={currentAgent?.avatar?.filepath ?? ''}
        />
      }
    />
  );
}
