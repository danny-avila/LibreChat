import React from 'react';
import UninitializedMCPTool from './UninitializedMCPTool';
import UnconfiguredMCPTool from './UnconfiguredMCPTool';
import { useAgentPanelContext } from '~/Providers';
import { useHasAccess, useLocalize } from '~/hooks';
import MCPTool from './MCPTool';
import { PermissionTypes, Permissions } from 'librechat-data-provider';

export default function MCPTools({
  agentId,
  mcpServerNames,
  setShowMCPToolDialog,
}: {
  agentId: string;
  mcpServerNames?: string[];
  setShowMCPToolDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const localize = useLocalize();
  const { mcpServersMap } = useAgentPanelContext();
  const hasMcpAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });
  if (!hasMcpAccess) {
    return null;
  }
  return (
    <div className="mb-4">
      <label className="text-token-text-primary mb-2 block font-medium">
        {localize('com_ui_mcp_servers')}
      </label>
      <div>
        <div className="mb-1">
          {/* Render servers with selected tools */}
          {mcpServerNames?.map((mcpServerName) => {
            const serverInfo = mcpServersMap.get(mcpServerName);
            if (!serverInfo?.isConfigured) {
              return (
                <UnconfiguredMCPTool
                  key={`${mcpServerName}-${agentId}`}
                  serverName={mcpServerName}
                />
              );
            }
            if (!serverInfo) {
              return null;
            }

            if (serverInfo.isConnected) {
              return (
                <MCPTool key={`${serverInfo.serverName}-${agentId}`} serverInfo={serverInfo} />
              );
            }

            return (
              <UninitializedMCPTool
                key={`${serverInfo.serverName}-${agentId}`}
                serverInfo={serverInfo}
              />
            );
          })}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMCPToolDialog(true)}
            className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
            aria-haspopup="dialog"
          >
            <div className="flex w-full items-center justify-center gap-2">
              {localize('com_assistants_add_mcp_server_tools')}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
