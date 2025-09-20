import React, { createContext, useContext, useState, useMemo } from 'react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { MCP, Action, TPlugin, AgentToolType } from 'librechat-data-provider';
import type { AgentPanelContextType, MCPServerInfo } from '~/common';
import {
  useAvailableToolsQuery,
  useGetActionsQuery,
  useGetStartupConfig,
  useMCPToolsQuery,
} from '~/data-provider';
import { useLocalize, useGetAgentsConfig, useMCPConnectionStatus } from '~/hooks';
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

  const { data: regularTools } = useAvailableToolsQuery(EModelEndpoint.agents, {
    enabled: !!agent_id,
  });

  const { data: mcpTools } = useMCPToolsQuery({
    enabled: !!agent_id,
  });

  const { data: startupConfig } = useGetStartupConfig();
  const { agentsConfig, endpointsConfig } = useGetAgentsConfig();
  const mcpServerNames = useMemo(
    () => Object.keys(startupConfig?.mcpServers ?? {}),
    [startupConfig],
  );

  const { connectionStatus } = useMCPConnectionStatus({
    enabled: !!agent_id && mcpServerNames.length > 0,
  });

  const processedData = useMemo(() => {
    const tools: AgentToolType[] = [];
    const groupedTools: GroupedToolsRecord = {};
    const configuredServers = new Set(mcpServerNames);
    const mcpServersMap = new Map<string, MCPServerInfo>();

    if (regularTools) {
      for (const pluginTool of regularTools) {
        const tool: AgentToolType = {
          tool_id: pluginTool.pluginKey,
          metadata: pluginTool as TPlugin,
        };

        tools.push(tool);

        // Regular tools go into groupedTools
        groupedTools[tool.tool_id] = {
          tool_id: tool.tool_id,
          metadata: tool.metadata,
        };
      }
    }

    if (mcpTools) {
      for (const pluginTool of mcpTools) {
        const tool: AgentToolType = {
          tool_id: pluginTool.pluginKey,
          metadata: pluginTool as TPlugin,
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
              isConnected: connectionStatus?.[serverName]?.connectionState === 'connected',
              metadata,
            });
          }

          mcpServersMap.get(serverName)!.tools.push(tool);
        }
      }
    }

    for (const mcpServerName of mcpServerNames) {
      if (mcpServersMap.has(mcpServerName)) {
        continue;
      }
      const metadata = {
        icon: '',
        name: mcpServerName,
        pluginKey: mcpServerName,
        description: `${localize('com_ui_tool_collection_prefix')} ${mcpServerName}`,
      } as TPlugin;

      mcpServersMap.set(mcpServerName, {
        tools: [],
        metadata,
        isConfigured: true,
        serverName: mcpServerName,
        isConnected: connectionStatus?.[mcpServerName]?.connectionState === 'connected',
      });
    }

    return {
      tools,
      groupedTools,
      mcpServersMap,
    };
  }, [regularTools, mcpTools, localize, mcpServerNames, connectionStatus]);

  const pluginTools = useMemo(() => {
    const allTools = [...(regularTools || []), ...(mcpTools || [])];
    return allTools.length > 0 ? allTools : undefined;
  }, [regularTools, mcpTools]);

  const value: AgentPanelContextType = {
    mcp,
    mcps,
    action,
    setMcp,
    actions,
    setMcps,
    agent_id,
    setAction,
    pluginTools,
    activePanel,
    agentsConfig,
    startupConfig,
    setActivePanel,
    endpointsConfig,
    setCurrentAgentId,
    tools: processedData.tools,
    groupedTools: processedData.groupedTools,
    mcpServersMap: processedData.mcpServersMap,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
