import React from 'react';
import { Spinner } from '@librechat/client';
import { SettingsIcon, X } from 'lucide-react';
import type { MCPServerStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

let localize: ReturnType<typeof useLocalize>;

interface StatusIconProps {
  serverName: string;
  onConfigClick: (e: React.MouseEvent) => void;
}

interface InitializingStatusProps extends StatusIconProps {
  onCancel: (e: React.MouseEvent) => void;
  canCancel: boolean;
}

export interface MCPServerStatusIconProps {
  serverName: string;
  serverStatus?: MCPServerStatus;
  onConfigClick: (e: React.MouseEvent) => void;
  isInitializing: boolean;
  canCancel: boolean;
  onCancel: (e: React.MouseEvent) => void;
  hasCustomUserVars?: boolean;
  /** When true, renders as a small status dot for compact layouts */
  compact?: boolean;
}

/**
 * Renders the appropriate status icon for an MCP server based on its state
 */
export default function MCPServerStatusIcon({
  serverName,
  serverStatus,
  onConfigClick,
  isInitializing,
  canCancel,
  onCancel,
  hasCustomUserVars = false,
  compact = false,
}: MCPServerStatusIconProps) {
  localize = useLocalize();

  // Compact mode: render as a small status dot
  if (compact) {
    return <CompactStatusDot serverStatus={serverStatus} isInitializing={isInitializing} />;
  }

  if (isInitializing) {
    return (
      <InitializingStatusIcon
        serverName={serverName}
        onConfigClick={onConfigClick}
        onCancel={onCancel}
        canCancel={canCancel}
      />
    );
  }

  if (!serverStatus) {
    return null;
  }

  const { connectionState, requiresOAuth } = serverStatus;

  if (connectionState === 'connecting') {
    return <ConnectingStatusIcon serverName={serverName} onConfigClick={onConfigClick} />;
  }

  if (connectionState === 'disconnected') {
    if (requiresOAuth) {
      return <DisconnectedOAuthStatusIcon serverName={serverName} onConfigClick={onConfigClick} />;
    }
    return <DisconnectedStatusIcon serverName={serverName} onConfigClick={onConfigClick} />;
  }

  if (connectionState === 'error') {
    return <ErrorStatusIcon serverName={serverName} onConfigClick={onConfigClick} />;
  }

  if (connectionState === 'connected') {
    // Only show config button if there are customUserVars to configure
    if (hasCustomUserVars) {
      return <AuthenticatedStatusIcon serverName={serverName} onConfigClick={onConfigClick} />;
    }
    return (
      <ConnectedStatusIcon
        serverName={serverName}
        requiresOAuth={requiresOAuth}
        onConfigClick={onConfigClick}
      />
    );
  }

  return null;
}

interface CompactStatusDotProps {
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
}

function CompactStatusDot({ serverStatus, isInitializing }: CompactStatusDotProps) {
  if (isInitializing) {
    return (
      <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface-secondary bg-amber-500">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      </div>
    );
  }

  if (!serverStatus) {
    return <div className="h-3 w-3 rounded-full border-2 border-surface-secondary bg-gray-400" />;
  }

  const { connectionState } = serverStatus;

  const colorClass =
    {
      connected: 'bg-green-500',
      connecting: 'bg-amber-500',
      disconnected: 'bg-orange-500',
      error: 'bg-red-500',
    }[connectionState] || 'bg-gray-400';

  return <div className={`h-3 w-3 rounded-full border-2 border-surface-secondary ${colorClass}`} />;
}

function InitializingStatusIcon({ serverName, onCancel, canCancel }: InitializingStatusProps) {
  if (canCancel) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="group flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
        aria-label={localize('com_ui_cancel')}
        title={localize('com_ui_cancel')}
      >
        <div className="relative h-4 w-4">
          <Spinner className="h-4 w-4 text-text-primary group-hover:opacity-0" />
          <X className="absolute inset-0 h-4 w-4 text-red-500 opacity-0 group-hover:opacity-100" />
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center rounded p-1">
      <Spinner
        className="h-4 w-4 text-text-primary"
        aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
      />
    </div>
  );
}

function ConnectingStatusIcon({ serverName }: StatusIconProps) {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded p-1">
      <Spinner
        className="h-4 w-4 text-text-primary"
        aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
      />
    </div>
  );
}

function DisconnectedOAuthStatusIcon({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SettingsIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}

function DisconnectedStatusIcon({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SettingsIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}

function ErrorStatusIcon({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SettingsIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}

function AuthenticatedStatusIcon({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SettingsIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}

interface ConnectedStatusProps {
  serverName: string;
  requiresOAuth?: boolean;
  onConfigClick: (e: React.MouseEvent) => void;
}

function ConnectedStatusIcon({ serverName, requiresOAuth, onConfigClick }: ConnectedStatusProps) {
  if (requiresOAuth) {
    return (
      <button
        type="button"
        onClick={onConfigClick}
        className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
        aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
      >
        <SettingsIcon className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      </button>
    );
  }

  // Status is shown via the colored dot on the server icon
  return null;
}
