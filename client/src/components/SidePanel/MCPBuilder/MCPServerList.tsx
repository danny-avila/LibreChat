import { useState, useRef } from 'react';
import { GearIcon, MCPIcon, OGDialogTrigger } from '@librechat/client';
import {
  PermissionBits,
  PermissionTypes,
  Permissions,
  hasPermissions,
} from 'librechat-data-provider';
import { useLocalize, useHasAccess, MCPServerDefinition } from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPServerDialog from './MCPServerDialog';

interface MCPServerListProps {
  servers: MCPServerDefinition[];
  getServerStatusIconProps: (
    serverName: string,
  ) => React.ComponentProps<typeof MCPServerStatusIcon>;
  isFiltered?: boolean;
}

// Self-contained edit button component (follows MemoryViewer pattern)
const EditMCPServerButton = ({ server }: { server: MCPServerDefinition }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MCPServerDialog open={open} onOpenChange={setOpen} triggerRef={triggerRef} server={server}>
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

export default function MCPServerList({
  servers,
  getServerStatusIconProps,
  isFiltered = false,
}: MCPServerListProps) {
  const canCreateEditMCPs = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const localize = useLocalize();

  if (servers.length === 0) {
    return (
      <div className="rounded-lg border border-border-light bg-transparent p-8 text-center shadow-sm">
        {isFiltered ? (
          <p className="text-sm text-text-secondary">{localize('com_ui_no_mcp_servers_match')}</p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">{localize('com_ui_no_mcp_servers')}</p>
            <p className="mt-1 text-xs text-text-tertiary">
              {localize('com_ui_add_first_mcp_server')}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {servers.map((server) => {
        const canEditThisServer = hasPermissions(server.effectivePermissions, PermissionBits.EDIT);
        const displayName = server.config?.title || server.serverName;
        const serverKey = `key_${server.serverName}`;

        return (
          <div key={serverKey} className="rounded-lg border border-border-light bg-transparent p-3">
            <div className="flex items-center gap-3">
              {/* Server Icon */}
              {server.config?.iconPath ? (
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

              {/* Connection Status Icon */}
              <MCPServerStatusIcon {...getServerStatusIconProps(server.serverName)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
