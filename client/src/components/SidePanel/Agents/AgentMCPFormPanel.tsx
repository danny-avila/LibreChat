import { useAgentPanelContext } from '~/Providers/AgentPanelContext';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';
import type { MCP } from '~/common';
import MCPFormPanel from '../MCP/MCPFormPanel';

// TODO: Add MCP delete (for now mocked for ui)
// import { useDeleteAgentMCP } from '~/data-provider';

function useDeleteAgentMCP({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (error: Error) => void;
}) {
  return {
    mutate: async ({ mcp_id, agent_id }: { mcp_id: string; agent_id: string }) => {
      try {
        console.log('Mock delete MCP:', { mcp_id, agent_id });
        onSuccess();
      } catch (error) {
        onError(error as Error);
      }
    },
  };
}

function useUpdateAgentMCP({
  onSuccess,
  onError,
}: {
  onSuccess: (mcp: MCP) => void;
  onError: (error: Error) => void;
}) {
  return {
    mutate: async (mcp: MCP) => {
      try {
        // TODO: Implement MCP endpoint
        onSuccess(mcp);
      } catch (error) {
        onError(error as Error);
      }
    },
    isLoading: false,
  };
}

export default function AgentMCPFormPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mcp, setMcp, agent_id, setActivePanel } = useAgentPanelContext();

  const updateAgentMCP = useUpdateAgentMCP({
    onSuccess(mcp) {
      showToast({
        message: localize('com_ui_update_mcp_success'),
        status: 'success',
      });
      setMcp(mcp);
    },
    onError(error) {
      showToast({
        message: (error as Error).message || localize('com_ui_update_mcp_error'),
        status: 'error',
      });
    },
  });

  const deleteAgentMCP = useDeleteAgentMCP({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_delete_mcp_success'),
        status: 'success',
      });
      setActivePanel(Panel.builder);
      setMcp(undefined);
    },
    onError(error) {
      showToast({
        message: (error as Error).message ?? localize('com_ui_delete_mcp_error'),
        status: 'error',
      });
    },
  });

  const handleBack = () => {
    setActivePanel(Panel.builder);
    setMcp(undefined);
  };

  const handleSave = (mcp: MCP) => {
    updateAgentMCP.mutate(mcp);
  };

  const handleDelete = (mcp_id: string, contextId: string) => {
    deleteAgentMCP.mutate({ mcp_id, agent_id: contextId });
  };

  return (
    <MCPFormPanel
      mcp={mcp}
      contextId={agent_id}
      onBack={handleBack}
      onDelete={handleDelete}
      onSave={handleSave}
      showDeleteButton={!!mcp}
      isDeleteDisabled={!agent_id || !mcp?.mcp_id}
    />
  );
}
