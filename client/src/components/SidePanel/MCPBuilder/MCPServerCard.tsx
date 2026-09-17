import { useState, useRef } from 'react';
import { MCPIcon } from '@librechat/client';
import { PermissionBits, hasPermissions } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import { useMCPServerManager, useLocalize } from '~/hooks';
import { getStatusDotColor } from './MCPStatusBadge';
import CustomIcon from '~/components/ui/CustomIcon';
import MCPServerDialog from './MCPServerDialog';
import MCPCardActions from './MCPCardActions';
import { cn } from '~/utils';

interface MCPServerCardProps {
  server: MCPServerDefinition;
  getServerStatusIconProps: (serverName: string) => MCPServerStatusIconProps;
  canCreateEditMCPs: boolean;
}

/**
 * Compact card component for displaying an MCP server with status and actions.
 *
 * Visual design:
 * - Status shown via colored dot on icon (no separate badge - avoids redundancy)
 * - Action buttons clearly indicate available operations
 * - Consistent with MCPServerMenuItem in chat dropdown
 */
export default function MCPServerCard({
  server,
  getServerStatusIconProps,
  canCreateEditMCPs,
}: MCPServerCardProps) {
  const localize = useLocalize();
  const triggerRef = useRef<HTMLDivElement>(null);
  const { initializeServer, revokeOAuthForServer } = useMCPServerManager();
  const [dialogOpen, setDialogOpen] = useState(false);

  const statusIconProps = getServerStatusIconProps(server.serverName);
  const {
    serverStatus,
    onConfigClick,
    isInitializing,
    canCancel,
    onCancel,
    hasCustomUserVars = false,
  } = statusIconProps;

  const canEditThisServer = hasPermissions(server.effectivePermissions, PermissionBits.EDIT);
  const displayName = server.config?.title || server.serverName;
  const description = server.config?.description;
  const statusDotColor = getStatusDotColor(serverStatus, isInitializing);
  const canEdit = canCreateEditMCPs && canEditThisServer;

  const handleInitialize = () => {
    /** If server has custom user vars and is not already connected, show config dialog first
     *  This ensures users can enter credentials before initialization attempts
     */
    if (hasCustomUserVars && serverStatus?.connectionState !== 'connected') {
      onConfigClick({ stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent);
      return;
    }
    initializeServer(server.serverName);
  };

  const handleRevoke = () => {
    revokeOAuthForServer(server.serverName);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDialogOpen(true);
  };

  // Determine status text for accessibility
  const getStatusText = () => {
    if (isInitializing) return localize('com_nav_mcp_status_initializing');
    if (!serverStatus) return localize('com_nav_mcp_status_unknown');
    const { connectionState, requiresOAuth } = serverStatus;
    if (connectionState === 'connecting') return localize('com_nav_mcp_status_connecting');
    if (serverStatus.requestScoped) return localize('com_nav_mcp_status_on_demand');
    if (connectionState === 'connected') return localize('com_nav_mcp_status_connected');
    if (connectionState === 'error') return localize('com_nav_mcp_status_error');
    if (connectionState === 'disconnected') {
      return requiresOAuth
        ? localize('com_nav_mcp_status_needs_auth')
        : localize('com_nav_mcp_status_disconnected');
    }
    return localize('com_nav_mcp_status_unknown');
  };

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2.5',
          'border-border-light border bg-transparent',
        )}
        aria-label={`${displayName} - ${getStatusText()}`}
      >
        {/* Server Icon with Status Dot */}
        <div className="relative shrink-0">
          {server.config?.iconPath ? (
            <CustomIcon
              src={server.config.iconPath}
              className="text-text-primary size-8 rounded-lg object-cover"
              alt=""
            />
          ) : (
            <div className="bg-surface-tertiary flex size-8 items-center justify-center rounded-lg">
              <MCPIcon className="text-text-secondary size-5" aria-hidden="true" />
            </div>
          )}
          {/* Status dot - color indicates connection state */}
          <div
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-3 rounded-full',
              'border-surface-primary border-2',
              statusDotColor,
              (isInitializing || serverStatus?.connectionState === 'connecting') && 'animate-pulse',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Server Info */}
        <div className="min-w-0 flex-1">
          <div className="text-text-primary truncate text-sm font-medium">{displayName}</div>
          {description && <p className="text-text-secondary truncate text-xs">{description}</p>}
        </div>

        {/* Actions */}
        <div className="shrink-0">
          <MCPCardActions
            serverName={server.serverName}
            serverStatus={serverStatus}
            isInitializing={isInitializing}
            canCancel={canCancel}
            hasCustomUserVars={hasCustomUserVars}
            canEdit={canEdit}
            editButtonRef={triggerRef}
            onEditClick={handleEditClick}
            onConfigClick={onConfigClick}
            onInitialize={handleInitialize}
            onCancel={onCancel}
            onRevoke={handleRevoke}
          />
        </div>
      </div>

      {/* Edit Dialog - separate from card */}
      {canEdit && (
        <MCPServerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          triggerRef={triggerRef}
          server={server}
        />
      )}
    </>
  );
}
