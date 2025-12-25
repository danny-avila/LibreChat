import * as Ariakit from '@ariakit/react';
import { MCPIcon, Checkbox, TooltipAnchor } from '@librechat/client';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { MCPServerStatusIconProps } from './MCPServerStatusIcon';
import MCPServerStatusIcon from './MCPServerStatusIcon';
import {
  getStatusColor,
  getStatusTextKey,
  shouldShowActionButton,
  type ConnectionStatusMap,
} from './mcpServerUtils';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPServerMenuItemProps {
  server: MCPServerDefinition;
  isSelected: boolean;
  connectionStatus?: ConnectionStatusMap;
  isInitializing?: (serverName: string) => boolean;
  statusIconProps?: MCPServerStatusIconProps | null;
  onToggle: (serverName: string) => void;
}

export default function MCPServerMenuItem({
  server,
  isSelected,
  connectionStatus,
  isInitializing,
  statusIconProps,
  onToggle,
}: MCPServerMenuItemProps) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const statusColor = getStatusColor(server.serverName, connectionStatus, isInitializing);
  const statusTextKey = getStatusTextKey(server.serverName, connectionStatus, isInitializing);
  const showActionButton = shouldShowActionButton(statusIconProps);

  return (
    <Ariakit.MenuItem
      hideOnClick={false}
      onClick={(event) => {
        event.preventDefault();
        onToggle(server.serverName);
      }}
      role="menuitemcheckbox"
      aria-checked={isSelected}
      aria-label={displayName}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2',
        'outline-none transition-all duration-150',
        'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
        isSelected && 'bg-surface-active-alt',
      )}
    >
      {/* Server Icon with Status Dot */}
      <div className="relative flex-shrink-0">
        {server.config?.iconPath ? (
          <img
            src={server.config.iconPath}
            className="h-8 w-8 rounded-lg object-cover"
            alt={displayName}
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-tertiary">
            <MCPIcon className="h-5 w-5 text-text-secondary" />
          </div>
        )}
        {/* Status dot - always shows tooltip for accessibility */}
        <TooltipAnchor
          description={localize(statusTextKey as Parameters<typeof localize>[0])}
          side="top"
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-secondary',
            statusColor,
          )}
        />
      </div>

      {/* Server Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-primary">{displayName}</span>
        </div>
        {server.config?.description && (
          <p className="truncate text-xs text-text-secondary">{server.config.description}</p>
        )}
      </div>

      {/* Action Button - only show when actionable */}
      {showActionButton && statusIconProps && (
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <MCPServerStatusIcon {...statusIconProps} />
        </div>
      )}

      {/* Selection Indicator - decorative, state conveyed by aria-checked on MenuItem */}
      <span aria-hidden="true" className="flex flex-shrink-0 items-center">
        <Checkbox
          checked={isSelected}
          tabIndex={-1}
          aria-label={displayName}
          className="pointer-events-none"
        />
      </span>
    </Ariakit.MenuItem>
  );
}
