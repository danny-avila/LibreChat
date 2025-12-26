import { Check, PlugZap } from 'lucide-react';
import { Spinner } from '@librechat/client';
import type { MCPServerStatus } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPStatusBadgeProps {
  serverStatus?: MCPServerStatus;
  isInitializing?: boolean;
  className?: string;
}

/**
 * Status badge component for MCP servers - used in dialogs where text status is needed.
 *
 * Unified color system:
 * - Green: Connected/Active (success)
 * - Blue: Connecting/In-progress
 * - Amber: Needs user action (OAuth required)
 * - Gray: Disconnected/Inactive (neutral)
 * - Red: Error
 */
export default function MCPStatusBadge({
  serverStatus,
  isInitializing = false,
  className,
}: MCPStatusBadgeProps) {
  const localize = useLocalize();

  const badgeBaseClass = cn(
    'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
    className,
  );

  // Initializing/Connecting state - blue
  if (isInitializing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          badgeBaseClass,
          'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
        )}
      >
        <Spinner className="size-3" />
        <span>{localize('com_nav_mcp_status_initializing')}</span>
      </div>
    );
  }

  if (!serverStatus) {
    return null;
  }

  const { connectionState, requiresOAuth } = serverStatus;

  // Connecting state - blue
  if (connectionState === 'connecting') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          badgeBaseClass,
          'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
        )}
      >
        <Spinner className="size-3" />
        <span>{localize('com_nav_mcp_status_connecting')}</span>
      </div>
    );
  }

  // Disconnected state - check if needs action
  if (connectionState === 'disconnected') {
    if (requiresOAuth) {
      // Needs OAuth - amber (requires action)
      return (
        <div
          role="status"
          className={cn(
            badgeBaseClass,
            'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
          )}
        >
          <PlugZap className="size-3" aria-hidden="true" />
          <span>{localize('com_nav_mcp_status_needs_auth')}</span>
        </div>
      );
    }
    // Simply disconnected - gray (neutral)
    return (
      <div
        role="status"
        className={cn(
          badgeBaseClass,
          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        )}
      >
        <span>{localize('com_nav_mcp_status_disconnected')}</span>
      </div>
    );
  }

  // Error state - red
  if (connectionState === 'error') {
    return (
      <div
        role="status"
        className={cn(badgeBaseClass, 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400')}
      >
        <span>{localize('com_nav_mcp_status_error')}</span>
      </div>
    );
  }

  // Connected state - green
  if (connectionState === 'connected') {
    return (
      <div
        role="status"
        className={cn(
          badgeBaseClass,
          'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
        )}
      >
        <Check className="size-3" aria-hidden="true" />
        <span>{localize('com_nav_mcp_status_connected')}</span>
      </div>
    );
  }

  return null;
}

/**
 * Returns the status dot color class - unified across all MCP components.
 *
 * Colors:
 * - Green: Connected
 * - Blue: Connecting/Initializing
 * - Amber: Needs action (OAuth required while disconnected)
 * - Gray: Disconnected (neutral)
 * - Red: Error
 */
export function getStatusDotColor(
  serverStatus?: MCPServerStatus,
  isInitializing?: boolean,
): string {
  if (isInitializing) {
    return 'bg-blue-500';
  }

  if (!serverStatus) {
    return 'bg-gray-400';
  }

  const { connectionState, requiresOAuth } = serverStatus;

  if (connectionState === 'connecting') {
    return 'bg-blue-500';
  }

  if (connectionState === 'connected') {
    return 'bg-green-500';
  }

  if (connectionState === 'error') {
    return 'bg-red-500';
  }

  if (connectionState === 'disconnected') {
    // Needs OAuth = amber, otherwise gray
    return requiresOAuth ? 'bg-amber-500' : 'bg-gray-400';
  }

  return 'bg-gray-400';
}
