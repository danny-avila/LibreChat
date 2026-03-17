import { useMemo } from 'react';
import { Blocks, MCPIcon, AttachmentIcon } from '@librechat/client';
import {
  Database,
  Bookmark,
  Settings2,
  ArrowRightToLine,
  MessageSquareQuote,
  FileText,
  LayoutDashboard,
  Megaphone,
  Users,
} from 'lucide-react';
import {
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  isParamEndpoint,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TInterfaceConfig, TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import AgentPanelSwitch from '~/components/SidePanel/Agents/AgentPanelSwitch';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import MemoryViewer from '~/components/SidePanel/Memories/MemoryViewer';
import PanelSwitch from '~/components/SidePanel/Builder/PanelSwitch';
import PromptsAccordion from '~/components/Prompts/PromptsAccordion';
import Parameters from '~/components/SidePanel/Parameters/Panel';
import FilesPanel from '~/components/SidePanel/Files/Panel';
import MCPPanel from '~/components/SidePanel/MCP/MCPPanel';
import SocialMediaPanel from '~/components/SidePanel/SocialMediaPanel';
import { useGetStartupConfig } from '~/data-provider';
import { useHasAccess } from '~/hooks';

export default function useSideNavLinks({
  hidePanel,
  keyProvided,
  endpoint,
  endpointType,
  interfaceConfig,
  endpointsConfig,
  openPDFBuilder,
  openDashboard,
  openSocialDraft,
  openHiringPanel,
}: {
  hidePanel: () => void;
  keyProvided: boolean;
  endpoint?: EModelEndpoint | null;
  endpointType?: EModelEndpoint | null;
  interfaceConfig: Partial<TInterfaceConfig>;
  endpointsConfig: TEndpointsConfig;
  openPDFBuilder?: () => void;
  openDashboard?: () => void;
  openSocialDraft?: () => void;
  openHiringPanel?: () => void;
}) {
  const hasAccessToPrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.USE,
  });
  const hasAccessToReadMemories = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.READ,
  });
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToCreateAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.CREATE,
  });
  const { data: startupConfig } = useGetStartupConfig();

  const Links = useMemo(() => {
    const links: NavLink[] = [];

    // PDF Builder - moved to top
    if (openPDFBuilder) {
      links.push({
        title: 'com_sidepanel_pdf_builder',
        label: '',
        icon: FileText,
        onClick: openPDFBuilder,
        id: 'pdf-builder',
      });
    }

    // Dashboard - moved to top
    if (openDashboard) {
      links.push({
        title: 'com_sidepanel_dashboard',
        label: '',
        icon: LayoutDashboard,
        onClick: openDashboard,
        id: 'dashboard',
      });
    }

    // Start Social Draft (Command Center)
    if (openSocialDraft) {
      links.push({
        title: 'com_sidepanel_social_draft',
        label: '',
        icon: Megaphone,
        id: 'social-media',
        Component: SocialMediaPanel,
      });
    }

    // Hiring & Onboarding Tool
    if (openHiringPanel) {
      links.push({
        title: 'com_sidepanel_hiring_onboarding',
        label: '',
        icon: Users,
        id: 'hiring-onboarding',
        onClick: openHiringPanel,
      });
    }

    if (
      isAssistantsEndpoint(endpoint) &&
      ((endpoint === EModelEndpoint.assistants &&
        endpointsConfig?.[EModelEndpoint.assistants] &&
        endpointsConfig[EModelEndpoint.assistants].disableBuilder !== true) ||
        (endpoint === EModelEndpoint.azureAssistants &&
          endpointsConfig?.[EModelEndpoint.azureAssistants] &&
          endpointsConfig[EModelEndpoint.azureAssistants].disableBuilder !== true)) &&
      keyProvided
    ) {
      links.push({
        title: 'com_sidepanel_assistant_builder',
        label: '',
        icon: Blocks,
        id: EModelEndpoint.assistants,
        Component: PanelSwitch,
      });
    }

    if (
      endpointsConfig?.[EModelEndpoint.agents] &&
      hasAccessToAgents &&
      hasAccessToCreateAgents &&
      endpointsConfig[EModelEndpoint.agents].disableBuilder !== true
    ) {
      links.push({
        title: 'com_sidepanel_agent_builder',
        label: '',
        icon: Blocks,
        id: EModelEndpoint.agents,
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

    // Memories - HIDDEN (commented out)
    // if (hasAccessToMemories && hasAccessToReadMemories) {
    //   links.push({
    //     title: 'com_ui_memories',
    //     label: '',
    //     icon: Database,
    //     id: 'memories',
    //     Component: MemoryViewer,
    //   });
    // }

    // Parameters - HIDDEN (commented out)
    // if (
    //   interfaceConfig.parameters === true &&
    //   isParamEndpoint(endpoint ?? '', endpointType ?? '') === true &&
    //   !isAgentsEndpoint(endpoint) &&
    //   keyProvided
    // ) {
    //   links.push({
    //     title: 'com_sidepanel_parameters',
    //     label: '',
    //     icon: Settings2,
    //     id: 'parameters',
    //     Component: Parameters,
    //   });
    // }

    // Attach Files - HIDDEN (commented out)
    // links.push({
    //   title: 'com_sidepanel_attach_files',
    //   label: '',
    //   icon: AttachmentIcon,
    //   id: 'files',
    //   Component: FilesPanel,
    // });

    // Bookmarks - HIDDEN (commented out)
    // if (hasAccessToBookmarks) {
    //   links.push({
    //     title: 'com_sidepanel_conversation_tags',
    //     label: '',
    //     icon: Bookmark,
    //     id: 'bookmarks',
    //     Component: BookmarkPanel,
    //   });
    // }

    if (
      startupConfig?.mcpServers &&
      Object.values(startupConfig.mcpServers).some(
        (server: any) =>
          (server.customUserVars && Object.keys(server.customUserVars).length > 0) ||
          server.isOAuth ||
          server.startup === false,
      )
    ) {
      links.push({
        title: 'com_nav_setting_mcp',
        label: '',
        icon: MCPIcon,
        id: 'mcp-settings',
        Component: MCPPanel,
      });
    }

    links.push({
      title: 'com_sidepanel_hide_panel',
      label: '',
      icon: ArrowRightToLine,
      onClick: hidePanel,
      id: 'hide-panel',
    });

    return links;
  }, [
    endpointsConfig,
    interfaceConfig.parameters,
    keyProvided,
    endpointType,
    endpoint,
    hasAccessToAgents,
    hasAccessToPrompts,
    hasAccessToMemories,
    hasAccessToReadMemories,
    hasAccessToBookmarks,
    hasAccessToCreateAgents,
    hidePanel,
    openPDFBuilder,
    openDashboard,
    openSocialDraft,
    openHiringPanel,
    startupConfig,
  ]);

  return Links;
}
