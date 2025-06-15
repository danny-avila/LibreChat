import { useCallback } from 'react';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import MCP from '~/components/SidePanel/Builder/MCP';
import { Panel } from '~/common';

export default function MCPSection() {
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { mcps = [], agent_id, setMcp, setActivePanel } = useAgentPanelContext();

  const handleAddMCP = useCallback(() => {
    if (!agent_id) {
      showToast({
        message: localize('com_agents_mcps_disabled'),
        status: 'warning',
      });
      return;
    }
    setActivePanel(Panel.mcp);
  }, [agent_id, setActivePanel, showToast, localize]);

  return (
    <div className="mb-4">
      <label className="text-token-text-primary mb-2 block font-medium">
        {localize('com_ui_mcp_servers')}
      </label>
      <div className="space-y-2">
        {mcps
          .filter((mcp) => mcp.agent_id === agent_id)
          .map((mcp, i) => (
            <MCP
              key={i}
              mcp={mcp}
              onClick={() => {
                setMcp(mcp);
                setActivePanel(Panel.mcp);
              }}
            />
          ))}
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={handleAddMCP}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
            aria-haspopup="dialog"
          >
            <div className="flex w-full items-center justify-center gap-2">
              {localize('com_ui_add_mcp')}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
