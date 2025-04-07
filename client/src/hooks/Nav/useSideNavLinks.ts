import type { TEndpointsConfig, TInterfaceConfig } from 'librechat-data-provider';
import { EModelEndpoint } from 'librechat-data-provider';
import { useMemo } from 'react';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import { BMOIcon } from '~/components/svg';

export default function useSideNavLinks({
  hidePanel,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
  endpointsConfig,
}: {
  hidePanel: () => void;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
  endpointsConfig: TEndpointsConfig;
}) {
  const Links = useMemo(() => {
    const links: NavLink[] = [];
    links.push({
      title: 'com_sidepanel_agent_builder',
      label: '',
      icon: BMOIcon,
      id: 'agents',
      Component: AgentPanelSwitch,
    });

    return links;
  }, [
    endpointsConfig,
    interfaceConfig.parameters,
    keyProvided,
    endpointType,
    endpoint,
    true,
    null,
    null,
    null,
    hidePanel,
  ]);

  return Links;
}
