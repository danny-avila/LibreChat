import React from 'react';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { Pencil, PlugZap, SlidersHorizontal, RefreshCw, X, Trash2 } from 'lucide-react';
import type { MCPServerStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPCardActionsProps {
  serverName: string;
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  canCancel: boolean;
  hasCustomUserVars: boolean;
  canEdit: boolean;
  editButtonRef?: React.RefObject<HTMLDivElement>;
  onEditClick: (e: React.MouseEvent) => void;
  onConfigClick: (e: React.MouseEvent) => void;
  onInitialize: () => void;
  onCancel: (e: React.MouseEvent) => void;
  onRevoke?: () => void;
}

/**
 * Standardized action buttons for MCP server cards.
 *
 * Unified icon system (each icon has ONE meaning):
 * - Pencil: Edit server definition (Settings panel only)
 * - PlugZap: Connect/Authenticate (for disconnected/error servers)
 * - SlidersHorizontal: Configure custom variables (for connected servers with vars)
 * - Trash2: Revoke OAuth access (for connected OAuth servers)
 * - RefreshCw: Reconnect/Refresh (for connected servers)
 * - Spinner: Loading state (with X on hover for cancel)
 */
export default function MCPCardActions({
  serverName,
  serverStatus,
  isInitializing,
  canCancel,
  hasCustomUserVars,
  canEdit,
  editButtonRef,
  onEditClick,
  onConfigClick,
  onInitialize,
  onCancel,
  onRevoke,
}: MCPCardActionsProps) {
  const localize = useLocalize();

  const connectionState = serverStatus?.connectionState;
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isDisconnected = connectionState === 'disconnected';
  const isError = connectionState === 'error';

  const buttonBaseClass = cn(
    'flex size-7 items-center justify-center rounded-md',
    'transition-colors duration-150',
    'text-text-secondary hover:text-text-secondary',
    'hover:bg-surface-tertiary',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
  );

  // Loading state - show spinner (with cancel option)
  if (isInitializing || isConnecting) {
    return (
      <div className="flex items-center gap-0.5">
        {/* Edit button stays visible during loading */}
        {canEdit && (
          <TooltipAnchor
            ref={editButtonRef}
            description={localize('com_ui_edit')}
            side="top"
            className={buttonBaseClass}
            aria-label={localize('com_ui_edit')}
            role="button"
            onClick={onEditClick}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </TooltipAnchor>
        )}

        {/* Spinner with cancel on hover */}
        {canCancel ? (
          <TooltipAnchor
            description={localize('com_ui_cancel')}
            side="top"
            className={cn(buttonBaseClass, 'group')}
            aria-label={localize('com_ui_cancel')}
            role="button"
            onClick={onCancel}
          >
            <div className="relative size-4">
              <Spinner className="size-4 group-hover:opacity-0" />
              <X className="absolute inset-0 size-4 text-text-destructive opacity-0 group-hover:opacity-100" />
            </div>
          </TooltipAnchor>
        ) : (
          <div className={cn(buttonBaseClass, 'cursor-default hover:bg-transparent')}>
            <Spinner
              className="size-4"
              aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Edit button - opens MCPServerDialog to edit server definition */}
      {canEdit && (
        <TooltipAnchor
          ref={editButtonRef}
          description={localize('com_ui_edit')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_edit')}
          role="button"
          onClick={onEditClick}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Connect button - for disconnected or error states */}
      {(isDisconnected || isError) && !serverStatus?.requestScoped && (
        <TooltipAnchor
          description={localize('com_nav_mcp_connect')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_nav_mcp_connect')}
          role="button"
          onClick={() => onInitialize()}
        >
          <PlugZap className="size-4" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* On-demand servers stay idle between requests, so their user variables
          must remain configurable without a live transport connection. */}
      {(isConnected || serverStatus?.requestScoped) && hasCustomUserVars && (
        <TooltipAnchor
          description={localize('com_ui_configure')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_configure')}
          role="button"
          onClick={onConfigClick}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Refresh button - for connected servers (allows reconnection) */}
      {isConnected && !serverStatus?.requestScoped && (
        <TooltipAnchor
          description={localize('com_nav_mcp_reconnect')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_nav_mcp_reconnect')}
          role="button"
          onClick={() => onInitialize()}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Revoke button - for OAuth servers (available regardless of connection state) */}
      {serverStatus?.requiresOAuth && onRevoke && (
        <TooltipAnchor
          description={localize('com_ui_revoke')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_revoke')}
          role="button"
          onClick={onRevoke}
        >
          <Trash2 className="size-3.5 text-text-destructive" aria-hidden="true" />
        </TooltipAnchor>
      )}
    </div>
  );
}
