import React from 'react';
import { Spinner } from '@librechat/client';
import { PlugZap, SlidersHorizontal, X } from 'lucide-react';
import type { MCPServerStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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
 * Renders the appropriate status icon for an MCP server based on its state.
 *
 * Unified icon system:
 * - PlugZap: Connect/Authenticate (for disconnected servers that need connection)
 * - SlidersHorizontal: Configure (for connected servers with custom vars)
 * - Spinner: Loading state (during connection)
 * - X: Cancel (during OAuth flow, shown on hover over spinner)
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

  // Loading state: show spinner (with cancel option if available)
  if (isInitializing) {
    return (
      <LoadingStatusIcon
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

  const { connectionState } = serverStatus;

  // Connecting: show spinner only (no action available)
  if (connectionState === 'connecting') {
    return <ConnectingSpinner serverName={serverName} />;
  }

  // Disconnected or Error: show connect button (PlugZap icon)
  if (connectionState === 'disconnected' || connectionState === 'error') {
    return <ConnectButton serverName={serverName} onConfigClick={onConfigClick} />;
  }

  // Connected: only show config button if there are custom vars to configure
  if (connectionState === 'connected' && hasCustomUserVars) {
    return <ConfigureButton serverName={serverName} onConfigClick={onConfigClick} />;
  }

  // Connected without custom vars: no action needed, status shown via dot
  return null;
}

interface CompactStatusDotProps {
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
}

function CompactStatusDot({ serverStatus, isInitializing }: CompactStatusDotProps) {
  if (isInitializing) {
    return (
      <div className="flex size-3.5 items-center justify-center rounded-full border-2 border-surface-secondary bg-blue-500">
        <div className="size-1.5 animate-pulse rounded-full bg-white" />
      </div>
    );
  }

  if (!serverStatus) {
    return <div className="size-3 rounded-full border-2 border-surface-secondary bg-gray-400" />;
  }

  const { connectionState, requiresOAuth } = serverStatus;

  let colorClass = 'bg-gray-400';
  if (connectionState === 'connected') {
    colorClass = 'bg-green-500';
  } else if (connectionState === 'connecting') {
    colorClass = 'bg-blue-500';
  } else if (connectionState === 'error') {
    colorClass = 'bg-red-500';
  } else if (connectionState === 'disconnected' && requiresOAuth) {
    colorClass = 'bg-amber-500';
  }

  return (
    <div className={cn('size-3 rounded-full border-2 border-surface-secondary', colorClass)} />
  );
}

function LoadingStatusIcon({ serverName, onCancel, canCancel }: InitializingStatusProps) {
  if (canCancel) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="group flex size-6 items-center justify-center rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
        aria-label={localize('com_ui_cancel')}
        title={localize('com_ui_cancel')}
      >
        <div className="relative size-4">
          <Spinner className="size-4 text-text-primary group-hover:opacity-0" />
          <X className="absolute inset-0 size-4 text-red-500 opacity-0 group-hover:opacity-100" />
        </div>
      </button>
    );
  }

  return (
    <div className="flex size-6 items-center justify-center rounded p-1">
      <Spinner
        className="size-4 text-text-primary"
        aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
      />
    </div>
  );
}

function ConnectingSpinner({ serverName }: { serverName: string }) {
  return (
    <div className="flex size-6 items-center justify-center rounded p-1">
      <Spinner
        className="size-4 text-text-primary"
        aria-label={localize('com_nav_mcp_status_connecting', { 0: serverName })}
      />
    </div>
  );
}

/** Connect button - shown for disconnected/error states. Uses PlugZap icon. */
function ConnectButton({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex size-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_connect_server', { 0: serverName })}
    >
      <PlugZap className="size-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}

/** Configure button - shown for connected servers with custom vars. Uses SlidersHorizontal icon. */
function ConfigureButton({ serverName, onConfigClick }: StatusIconProps) {
  return (
    <button
      type="button"
      onClick={onConfigClick}
      className="flex size-6 items-center justify-center rounded p-1 hover:bg-surface-secondary"
      aria-label={localize('com_nav_mcp_configure_server', { 0: serverName })}
    >
      <SlidersHorizontal className="size-4 text-text-secondary" aria-hidden="true" />
    </button>
  );
}
