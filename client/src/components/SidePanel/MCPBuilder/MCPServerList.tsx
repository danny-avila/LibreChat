import { useState, useRef, useMemo } from 'react';
import { GearIcon, MCPIcon, OGDialogTrigger } from '@librechat/client';
import {
  PermissionBits,
  PermissionTypes,
  Permissions,
  hasPermissions,
} from 'librechat-data-provider';
import type { MCPServerDB } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import { useLocalize, useHasAccess } from '~/hooks';
import MCPServerDialog from './MCPServerDialog';

interface MCPServerListProps {
  servers: MCPServerDefinition[];
}

// Self-contained edit button component (follows MemoryViewer pattern)
const EditMCPServerButton = ({ server }: { server: MCPServerDefinition }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Convert MCPServerDefinition to McpServer format for dialog
  // With unified schema, this is now trivial - just pass through the config
  const mcpServer: MCPServerDB = useMemo(
    () => ({
      _id: server._id,
      mcp_id: server.mcp_id || server.serverName,
      serverName: server.serverName,
      config: server.config,
    }),
    [server],
  );

  return (
    <MCPServerDialog open={open} onOpenChange={setOpen} triggerRef={triggerRef} server={mcpServer}>
      <OGDialogTrigger asChild>
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-surface-secondary"
          aria-label={localize('com_ui_edit')}
        >
          <GearIcon className="h-4 w-4" />
        </button>
      </OGDialogTrigger>
    </MCPServerDialog>
  );
};

export default function MCPServerList({ servers }: MCPServerListProps) {
  const canCreateEditMCPs = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const localize = useLocalize();

  if (servers.length === 0) {
    return (
      <div className="rounded-lg border border-border-light bg-transparent p-8 text-center shadow-sm">
        <p className="text-sm text-text-secondary">{localize('com_ui_no_mcp_servers')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{localize('com_ui_add_first_mcp_server')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {servers.map((server) => {
        const canEditThisServer = hasPermissions(server.effectivePermissions, PermissionBits.EDIT);
        // Use mcp_id for key if available (DB servers), otherwise use serverName
        const displayName = server.config?.title || server.mcp_id || server.serverName;
        const serverKey = `key_${displayName}`;

        return (
          <div key={serverKey} className="rounded-lg border border-border-light bg-transparent p-3">
            <div className="flex items-start gap-3">
              {/* Server Icon */}
              {server.config.iconPath ? (
                <img src={server.config.iconPath} className="h-5 w-5 rounded" alt={displayName} />
              ) : (
                <MCPIcon className="h-5 w-5" />
              )}

              {/* Server Info */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-text-primary">{displayName}</h3>
              </div>

              {/* Edit Button - Only for DB servers and when user has CREATE access */}
              {canCreateEditMCPs && canEditThisServer && <EditMCPServerButton server={server} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
