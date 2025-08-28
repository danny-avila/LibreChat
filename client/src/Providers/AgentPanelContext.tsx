import React, { createContext, useContext, useState, useMemo } from 'react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { MCP, Action, TPlugin, AgentToolType } from 'librechat-data-provider';
import type { AgentPanelContextType, MCPServerInfo } from '~/common';
import { useAvailableToolsQuery, useGetActionsQuery, useGetStartupConfig } from '~/data-provider';
import { useLocalize, useGetAgentsConfig, useMCPServerManager } from '~/hooks';
import { Panel } from '~/common';

type GroupedToolType = AgentToolType & { tools?: AgentToolType[] };
type GroupedToolsRecord = Record<string, GroupedToolType>;

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

  const { data: actions } = useGetActionsQuery(EModelEndpoint.agents, {
    enabled: !!agent_id,
  });

  const { data: pluginTools } = useAvailableToolsQuery(EModelEndpoint.agents, {
    enabled: !!agent_id,
  });

  const { connectionStatus } = useMCPServerManager();
  const { data: startupConfig } = useGetStartupConfig();

  const processedData = useMemo(() => {
    if (!pluginTools) {
      return {
        tools: [],
        groupedTools: {},
        mcpServersMap: new Map<string, MCPServerInfo>(),
      };
    }

    const tools: AgentToolType[] = [];
    const groupedTools: GroupedToolsRecord = {};

    const mcpServersMap = new Map<string, MCPServerInfo>();

    const configuredServers = new Set(
      startupConfig?.mcpServers ? Object.keys(startupConfig.mcpServers) : [],
    );

    for (const pluginTool of pluginTools) {
      const tool: AgentToolType = {
        tool_id: pluginTool.pluginKey,
        metadata: pluginTool as TPlugin,
        agent_id: agent_id || '',
      };

      tools.push(tool);

      if (tool.tool_id.includes(Constants.mcp_delimiter)) {
        const [_toolName, serverName] = tool.tool_id.split(Constants.mcp_delimiter);

        if (!mcpServersMap.has(serverName)) {
          const metadata = {
            name: serverName,
            pluginKey: serverName,
            description: `${localize('com_ui_tool_collection_prefix')} ${serverName}`,
            icon: pluginTool.icon || '',
          } as TPlugin;

          mcpServersMap.set(serverName, {
            serverName,
            tools: [],
            isConfigured: configuredServers.has(serverName),
            isConnected: connectionStatus[serverName]?.connectionState === 'connected',
            metadata,
          });
        }

        mcpServersMap.get(serverName)!.tools.push(tool);
      } else {
        // Non-MCP tool
        groupedTools[tool.tool_id] = {
          tool_id: tool.tool_id,
          metadata: tool.metadata,
          agent_id: agent_id || '',
        };
      }
    }

    return {
      tools,
      groupedTools,
      mcpServersMap,
    };
  }, [pluginTools, agent_id, localize, startupConfig?.mcpServers, connectionStatus]);

  const { agentsConfig, endpointsConfig } = useGetAgentsConfig();

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
    agentsConfig,
    setActivePanel,
    endpointsConfig,
    setCurrentAgentId,
    tools: processedData.tools,
    groupedTools: processedData.groupedTools,
    mcpServersMap: processedData.mcpServersMap,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
