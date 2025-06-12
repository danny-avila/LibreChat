import React, { createContext, useContext, useState } from 'react';
import { Action, MCP, EModelEndpoint } from 'librechat-data-provider';
import type { AgentPanelContextType } from '~/common';
import { useGetActionsQuery } from '~/data-provider';
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
  const [mcp, setMcp] = useState<MCP | undefined>(undefined);
  const [mcps, setMcps] = useState<MCP[] | undefined>(undefined);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [activePanel, setActivePanel] = useState<Panel>(Panel.builder);
  const [agent_id, setCurrentAgentId] = useState<string | undefined>(undefined);

  const { data: actions } = useGetActionsQuery(EModelEndpoint.agents, {
    enabled: !!agent_id,
  });

  const value = {
    action,
    setAction,
    mcp,
    setMcp,
    mcps,
    setMcps,
    activePanel,
    setActivePanel,
    setCurrentAgentId,
    agent_id,
    /** Query data for actions */
    actions,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
