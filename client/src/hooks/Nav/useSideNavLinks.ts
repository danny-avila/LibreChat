import { useMemo } from 'react';
import { MessageSquareQuote, ArrowRightToLine, Settings2, Bookmark } from 'lucide-react';
import {
  isAssistantsEndpoint,
  isAgentsEndpoint,
  PermissionTypes,
  isParamEndpoint,
  EModelEndpoint,
  Permissions,
} from 'librechat-data-provider';
import type { TConfig, TInterfaceConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
import PromptsAccordion from '~/components/Prompts/PromptsAccordion';
import Parameters from '~/components/SidePanel/Parameters/Panel';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import { Blocks, AttachmentIcon } from '~/components/svg';
import { useHasAccess } from '~/hooks';

export default function useSideNavLinks({
  hidePanel,
  assistants,
  agents,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
}: {
  hidePanel: () => void;
  assistants?: TConfig | null;
  agents?: TConfig | null;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
}) {
  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });

  const Links = useMemo(() => {
    const links: NavLink[] = [];
    if (
      isAssistantsEndpoint(endpoint) &&
      assistants &&
      assistants.disableBuilder !== true &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: 'assistants',
        Component: PanelSwitch,
      });
    }

    if (
      hasAccessToAgents &&
      hasAccessToCreateAgents &&
      isAgentsEndpoint(endpoint) &&
      agents &&
      agents.disableBuilder !== true
    ) {
      links.push({
        title: 'com_sidepanel_agent_builder',
        label: '',
        icon: Blocks,
        id: 'agents',
        Component: AgentPanelSwitch,
      });
    }

    if (hasAccessToPrompts) {
      links.push({
        title: 'com_ui_prompts',
        label: '',
        icon: MessageSquareQuote,
        id: 'prompts',
        Component: PromptsAccordion,
      });
    }

    if (
      interfaceConfig.parameters === true &&
      isParamEndpoint(endpoint ?? '', endpointType ?? '') === true &&
      !isAgentsEndpoint(endpoint) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_parameters',
        label: '',
        icon: Settings2,
        id: 'parameters',
        Component: Parameters,
      });
    }

    links.push({
      title: 'com_sidepanel_attach_files',
      label: '',
      icon: AttachmentIcon,
      id: 'files',
      Component: FilesPanel,
    });

    if (hasAccessToBookmarks) {
      links.push({
        title: 'com_sidepanel_conversation_tags',
        label: '',
        icon: Bookmark,
        id: 'bookmarks',
        Component: BookmarkPanel,
      });
    }

    // links.push({
    //   title: 'com_sidepanel_hide_panel',
    //   label: '',
    //   icon: ArrowRightToLine,
    //   onClick: hidePanel,
    //   id: 'hide-panel',
    // });

    return links;
  }, [
    interfaceConfig.parameters,
    keyProvided,
    assistants,
    endpointType,
    endpoint,
    agents,
    hasAccessToAgents,
    hasAccessToPrompts,
    hasAccessToBookmarks,
    hasAccessToCreateAgents,
    hidePanel,
  ]);

  return Links;
}
