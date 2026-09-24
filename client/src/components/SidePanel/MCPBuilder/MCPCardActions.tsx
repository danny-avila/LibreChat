import React from 'react';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { KeyRound, Pencil, PlugZap, RefreshCw, Unlink, X } from 'lucide-react';
import type { MCPServerStatus } from 'librechat-data-provider';
import { cn, rowActionClasses, rowActionSlotClasses } from '~/utils';
import { useLocalize } from '~/hooks';

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
 * The actions on an MCP server row.
 *
 * One icon, one meaning, and the meaning is the noun the action acts on rather
 * than a generic verb:
 * - Pencil: the server definition (Settings panel only)
 * - KeyRound: the credentials this server asks each user for, which is also what
 *   marks a server as needing authentication
 * - PlugZap: the connection, made
 * - Unlink: the account grant, given up. Revoking is dropping the link between
 *   this user and the provider, NOT deleting the server, which is what a trash can
 *   said here before and what it stays reserved for. A broken link rather than a
 *   pulled plug, because the grant and the transport are different things: revoking
 *   one does not close the other
 * - RefreshCw: reconnecting a server that is already connected
 * - Spinner, with X on hover: a connection in flight, and cancelling it
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

  const buttonBaseClass = rowActionClasses();
  /** A run in flight is a state of the row, not an action waiting to be found:
   *  the spinner and the cancel that replaces it stay put without a hover. */
  const loadingClass = rowActionClasses({ visible: true });

  // Loading state - show spinner (with cancel option)
  if (isInitializing || isConnecting) {
    return (
      <div className={rowActionSlotClasses({ open: true })}>
        {/* Edit button stays visible during loading */}
        {canEdit && (
          <TooltipAnchor
            focusOutline="hidden"
            ref={editButtonRef}
            description={localize('com_ui_edit')}
            side="top"
            className={loadingClass}
            aria-label={localize('com_ui_edit')}
            role="button"
            onClick={onEditClick}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </TooltipAnchor>
        )}

        {/* Spinner with cancel on hover */}
        {canCancel ? (
          <TooltipAnchor
            focusOutline="hidden"
            description={localize('com_ui_cancel')}
            side="top"
            className={cn(loadingClass, 'group/cancel')}
            aria-label={localize('com_ui_cancel')}
            role="button"
            onClick={onCancel}
          >
            <div className="relative size-4">
              {/* The fade belongs to the wrapper: the spinner's own opacity is the
                  primitive's, and so is the cancel cross's to the icon. */}
              <span className="absolute inset-0 flex items-center justify-center group-hover/cancel:opacity-0">
                <Spinner className="size-4" />
              </span>
              <X className="text-text-destructive absolute inset-0 size-4 opacity-0 group-hover/cancel:opacity-100" />
            </div>
          </TooltipAnchor>
        ) : (
          <div className={cn(loadingClass, 'cursor-default hover:bg-transparent')}>
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
    <div className={rowActionSlotClasses()}>
      {/* Edit button - opens MCPServerDialog to edit server definition */}
      {canEdit && (
        <TooltipAnchor
          focusOutline="hidden"
          ref={editButtonRef}
          description={localize('com_ui_edit')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_edit')}
          role="button"
          onClick={onEditClick}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Connect button - for disconnected or error states */}
      {(isDisconnected || isError) && !serverStatus?.requestScoped && (
        <TooltipAnchor
          focusOutline="hidden"
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
          focusOutline="hidden"
          description={localize('com_ui_configure')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_configure')}
          role="button"
          onClick={onConfigClick}
        >
          <KeyRound className="size-4" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Refresh button - for connected servers (allows reconnection) */}
      {isConnected && !serverStatus?.requestScoped && (
        <TooltipAnchor
          focusOutline="hidden"
          description={localize('com_nav_mcp_reconnect')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_nav_mcp_reconnect')}
          role="button"
          onClick={() => onInitialize()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </TooltipAnchor>
      )}

      {/* Revoke button - for OAuth servers (available regardless of connection state) */}
      {serverStatus?.requiresOAuth && onRevoke && (
        <TooltipAnchor
          focusOutline="hidden"
          description={localize('com_ui_revoke')}
          side="top"
          className={buttonBaseClass}
          aria-label={localize('com_ui_revoke')}
          role="button"
          onClick={onRevoke}
        >
          <Unlink className="text-text-destructive size-4" aria-hidden="true" />
        </TooltipAnchor>
      )}
    </div>
  );
}
