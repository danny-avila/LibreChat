import React from 'react';
import { SettingsIcon, AlertTriangle, Loader2, KeyRound, PlugZap, X } from 'lucide-react';
import type { MCPServerStatus, TPlugin } from 'librechat-data-provider';
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

interface MCPServerStatusIconProps {
  serverName: string;
  serverStatus?: MCPServerStatus;
  tool?: TPlugin;
  onConfigClick: (e: React.MouseEvent) => void;
  isInitializing: boolean;
  canCancel: boolean;
  onCancel: (e: React.MouseEvent) => void;
  hasCustomUserVars?: boolean;
}

/**
 * Renders the appropriate status icon for an MCP server based on its state
 */
export default function MCPServerStatusIcon({
  serverName,
  serverStatus,
  tool,
  onConfigClick,
  isInitializing,
  canCancel,
  onCancel,
  hasCustomUserVars = false,
}: MCPServerStatusIconProps) {
  localize = useLocalize();
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
      const isAuthenticated = tool?.authenticated || requiresOAuth;
      return (
        <AuthenticatedStatusIcon
          serverName={serverName}
          onConfigClick={onConfigClick}
          isAuthenticated={isAuthenticated}
        />
      );
    }
    return null; // No config button for connected servers without customUserVars
  }

  return null;
}

function InitializingStatusIcon({ serverName, onCancel, canCancel }: InitializingStatusProps) {
  if (canCancel) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
        aria-label={localize('com_ui_cancel')}
        title={localize('com_ui_cancel')}
      >
        <div className="group relative h-4 w-4">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500 group-hover:opacity-0" />
          <X className="absolute inset-0 h-4 w-4 text-red-500 opacity-0 group-hover:opacity-100" />
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-6 w-6 items-center justify-center rounded p-1">
      <Loader2
        className="h-4 w-4 animate-spin text-blue-500"
        aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
      />
    </div>
  );
}

function ConnectingStatusIcon({ serverName }: StatusIconProps) {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded p-1">
      <Loader2
        className="h-4 w-4 animate-spin text-blue-500"
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
      <KeyRound className="h-4 w-4 text-amber-500" />
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
      <PlugZap className="h-4 w-4 text-orange-500" />
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
      <AlertTriangle className="h-4 w-4 text-red-500" />
    </button>
  );
}

interface AuthenticatedStatusProps extends StatusIconProps {
  isAuthenticated: boolean;
}

function AuthenticatedStatusIcon({
  serverName,
  onConfigClick,
  isAuthenticated,
}: AuthenticatedStatusProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex h-6 w-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SettingsIcon className={`h-4 w-4 ${isAuthenticated ? 'text-green-500' : 'text-gray-400'}`} />
    </button>
  );
}
