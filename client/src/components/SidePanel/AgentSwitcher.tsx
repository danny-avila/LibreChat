import { useEffect, useMemo } from 'react';
import { EModelEndpoint, isAgentsEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { SwitcherProps, OptionWithIcon } from '~/common';
import { useSetIndexOptions, useSelectAgent, useAgentsMap, useLocalize } from '~/hooks';
import Icon from '~/components/Endpoints/Icon';
import { useChatContext } from '~/Providers';
import { Combobox } from '~/components/ui';

export default function AgentSwitcher({ isCollapsed }: SwitcherProps) {
  const localize = useLocalize();
  const { setOption } = useSetIndexOptions();
  const { index, conversation } = useChatContext();
  const { agent_id: selectedAgentId = null, endpoint } = conversation ?? {};

  const { data: agentsMap } = useAgentsMap({ isAuthenticated: true });
  const { onSelect } = useSelectAgent();

  const agents = useMemo(() => {
    return Object.values(agentsMap ?? {});
  }, [agentsMap]);

  useEffect(() => {
    if (!selectedAgentId && agents.length && agentsMap) {
      const agent_id =
        localStorage.getItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`) ?? agents[0]?.id ?? '';
      const agent = agentsMap[agent_id];

      if (agent && isAgentsEndpoint(endpoint)) {
        setOption('model')('');
        setOption('agent_id')(agent_id);
      }
    }
  }, [index, agents, selectedAgentId, agentsMap, endpoint, setOption]);

  const currentAgent = agentsMap?.[selectedAgentId ?? ''];

  const agentOptions: OptionWithIcon[] = useMemo(
    () =>
      agents.map((agent: Agent) => ({
        label: agent.name ?? '',
        value: agent.id,
        icon: (
          <Icon
            isCreatedByUser={false}
            endpoint={EModelEndpoint.agents}
            agentName={agent.name ?? ''}
            iconURL={(agent?.avatar as unknown as string) ?? ''}
          />
        ),
      })),
    [agents],
  );

  return (
    <Combobox
      selectedValue={currentAgent?.id ?? ''}
      displayValue={
        agents.find((agent) => agent.id === selectedAgentId)?.name ??
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
          iconURL={(currentAgent?.avatar as unknown as string) ?? ''}
        />
      }
    />
  );
}
