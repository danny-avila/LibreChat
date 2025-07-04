import React, { createContext, useContext, useState, useMemo } from 'react';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type {
  MCP,
  Action,
  TPlugin,
  AgentToolType,
  AgentCapabilities,
} from 'librechat-data-provider';
import type { AgentPanelContextType } from '~/common';
import type { TConfig, TEndpointsConfig, TAgentsEndpoint } from 'librechat-data-provider';
import { useAvailableToolsQuery, useGetActionsQuery } from '~/data-provider';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

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

  const tools =
    pluginTools?.map((tool) => ({
      tool_id: tool.pluginKey,
      metadata: tool as TPlugin,
      agent_id: agent_id || '',
    })) || [];

  const groupedTools = tools?.reduce(
    (acc, tool) => {
      if (tool.tool_id.includes(Constants.mcp_delimiter)) {
        const [_toolName, serverName] = tool.tool_id.split(Constants.mcp_delimiter);
        const groupKey = `${serverName.toLowerCase()}`;
        if (!acc[groupKey]) {
          acc[groupKey] = {
            tool_id: groupKey,
            metadata: {
              name: `${serverName}`,
              pluginKey: groupKey,
              description: `${localize('com_ui_tool_collection_prefix')} ${serverName}`,
              icon: tool.metadata.icon || '',
            } as TPlugin,
            agent_id: agent_id || '',
            tools: [],
          };
        }
        acc[groupKey].tools?.push({
          tool_id: tool.tool_id,
          metadata: tool.metadata,
          agent_id: agent_id || '',
        });
      } else {
        acc[tool.tool_id] = {
          tool_id: tool.tool_id,
          metadata: tool.metadata,
          agent_id: agent_id || '',
        };
      }
      return acc;
    },
    {} as Record<string, AgentToolType & { tools?: AgentToolType[] }>,
  );

  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const agentsConfig = useMemo<TAgentsEndpoint | null>(() => {
    const config = endpointsConfig?.[EModelEndpoint.agents] ?? null;
    if (!config) return null;

    return {
      ...(config as TConfig),
      capabilities: Array.isArray(config.capabilities)
        ? config.capabilities.map((cap) => cap as unknown as AgentCapabilities)
        : ([] as AgentCapabilities[]),
    } as TAgentsEndpoint;
  }, [endpointsConfig]);

  const value = {
    mcp,
    mcps,
    /** Query data for actions and tools */
    tools,
    action,
    setMcp,
    actions,
    setMcps,
    agent_id,
    setAction,
    activePanel,
    groupedTools,
    agentsConfig,
    setActivePanel,
    endpointsConfig,
    setCurrentAgentId,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
