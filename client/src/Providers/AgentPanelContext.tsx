import React, { createContext, useContext, useState } from 'react';
import { Action, MCP } from 'librechat-data-provider';
import type { AgentPanelContextType } from '~/common';
import { Panel } from '~/common';

const AgentPanelContext = createContext<AgentPanelContextType | undefined>(undefined);

export function useAgentPanelContext() {
  const context = useContext(AgentPanelContext);
  if (context === undefined) {
    throw new Error('useAgentPanelContext must be used within an AgentPanelProvider');
  }
  return context;
}

export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  // All the state (formerly 'commonProps')
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [actions, setActions] = useState<Action[] | undefined>(undefined);
  const [mcp, setMcp] = useState<MCP | undefined>(undefined);
  const [mcps, setMcps] = useState<MCP[] | undefined>(undefined);
  const [activePanel, setActivePanel] = useState<Panel>(Panel.builder);
  const [agent_id, setCurrentAgentId] = useState<string | undefined>(undefined);

  const value = {
    action,
    setAction,
    actions,
    setActions,
    mcp,
    setMcp,
    mcps,
    setMcps,
    activePanel,
    setActivePanel,
    setCurrentAgentId,
    agent_id,
  };

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>;
}
