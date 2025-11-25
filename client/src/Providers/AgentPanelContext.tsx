import React, { createContext, useContext, useState, useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { MCP, Action, TPlugin } from 'librechat-data-provider';
import type { AgentPanelContextType, MCPServerInfo } from '~/common';
import {
  useAvailableToolsQuery,
  useGetActionsQuery,
  useGetStartupConfig,
  useMCPToolsQuery,
} from '~/data-provider';
import { useLocalize, useGetAgentsConfig, useMCPConnectionStatus } from '~/hooks';
import { Panel, isEphemeralAgent } from '~/common';

const AgentPanelContext = createContext<AgentPanelContextType | undefined>(undefined);

export function useAgentPanelContext() {
  const context = useContext(AgentPanelContext);
  if (context === undefined) {
    throw new Error('useAgentPanelContext must be used within an AgentPanelProvider');
  }
  return context;
}

/** Houses relevant state for the Agent Form Panels (formerly 'commonProps') */
export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  const localize = useLocalize();
  const [mcp, setMcp] = useState<MCP | undefined>(undefined);
  const [mcps, setMcps] = useState<MCP[] | undefined>(undefined);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [activePanel, setActivePanel] = useState<Panel>(Panel.builder);
  const [agent_id, setCurrentAgentId] = useState<string | undefined>(undefined);

  const { data: startupConfig } = useGetStartupConfig();
  const { data: actions } = useGetActionsQuery(EModelEndpoint.agents, {
    enabled: !isEphemeralAgent(agent_id),
  });

  const { data: regularTools } = useAvailableToolsQuery(EModelEndpoint.agents);

  const { data: mcpData } = useMCPToolsQuery({
    enabled: !isEphemeralAgent(agent_id) && startupConfig?.mcpServers != null,
  });

  const { agentsConfig, endpointsConfig } = useGetAgentsConfig();
  const mcpServerNames = useMemo(
    () => Object.keys(startupConfig?.mcpServers ?? {}),
    [startupConfig],
  );

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !isEphemeralAgent(agent_id) && mcpServerNames.length > 0,
  });

  const mcpServersMap = useMemo(() => {
    const configuredServers = new Set(mcpServerNames);
    const serversMap = new Map<string, MCPServerInfo>();

    if (mcpData?.servers) {
      for (const [serverName, serverData] of Object.entries(mcpData.servers)) {
        const metadata = {
          name: serverName,
          pluginKey: serverName,
          description: `${localize('com_ui_tool_collection_prefix')} ${serverName}`,
          icon: serverData.icon || '',
          authConfig: serverData.authConfig,
          authenticated: serverData.authenticated,
        } as TPlugin;

        const tools = serverData.tools.map((tool) => ({
          tool_id: tool.pluginKey,
          metadata: {
            ...tool,
            icon: serverData.icon,
            authConfig: serverData.authConfig,
            authenticated: serverData.authenticated,
          } as TPlugin,
        }));

        serversMap.set(serverName, {
          serverName,
          tools,
          isConfigured: configuredServers.has(serverName),
          isConnected: connectionStatus?.[serverName]?.connectionState === 'connected',
          metadata,
        });
      }
    }

    // Add configured servers that don't have tools yet
    for (const mcpServerName of mcpServerNames) {
      if (serversMap.has(mcpServerName)) {
        continue;
      }
      const metadata = {
        icon: '',
        name: mcpServerName,
        pluginKey: mcpServerName,
        description: `${localize('com_ui_tool_collection_prefix')} ${mcpServerName}`,
      } as TPlugin;

      serversMap.set(mcpServerName, {
        tools: [],
        metadata,
        isConfigured: true,
        serverName: mcpServerName,
        isConnected: connectionStatus?.[mcpServerName]?.connectionState === 'connected',
      });
    }

    return serversMap;
  }, [mcpData, localize, mcpServerNames, connectionStatus]);

  const value: AgentPanelContextType = {
    mcp,
    mcps,
    action,
    setMcp,
    actions,
    setMcps,
    agent_id,
    setAction,
    activePanel,
    regularTools,
    agentsConfig,
    startupConfig,
    mcpServersMap,
    setActivePanel,
    endpointsConfig,
    setCurrentAgentId,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
