import { Check } from 'lucide-react';
import { MCPIcon } from '@librechat/client';
import { getStatusColor } from '~/components/MCP/mcpServerUtils';
import { useMCPServerManager, useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MCPServerPickerProps {
  value: string[];
  onChange: (servers: string[]) => void;
}

/**
 * Multi-select MCP server picker for the Scheduled Tasks builder. Mirrors the
 * visual treatment used by the in-chat MCPSelect (server icon + friendly
 * `config.title` + description + status dot) but renders as a plain checkbox
 * list so it can sit inside the builder form instead of an Ariakit menu.
 */
export default function MCPServerPicker({ value, onChange }: MCPServerPickerProps) {
  const localize = useLocalize();
  const { selectableServers, connectionStatus, isInitializing } = useMCPServerManager();
  const selected = new Set(value);

  if (selectableServers.length === 0) {
    return null;
  }

  const toggle = (serverName: string) => {
    if (selected.has(serverName)) {
      onChange(value.filter((name) => name !== serverName));
      return;
    }
    onChange([...value, serverName]);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-text-primary">
        {localize('com_ui_mcp_servers')}
      </label>
      <div className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary p-1.5">
        {selectableServers.map((server) => {
          const isSelected = selected.has(server.serverName);
          const displayName = server.config?.title || server.serverName;
          const statusColor = getStatusColor(
            server.serverName,
            connectionStatus,
            isInitializing,
          );
          return (
            <button
              key={server.serverName}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggle(server.serverName)}
              className={cn(
                'group flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                'outline-none transition-all duration-150',
                'hover:bg-surface-hover focus-visible:bg-surface-hover',
                isSelected && 'bg-surface-active-alt',
              )}
            >
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
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-secondary',
                    statusColor,
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {displayName}
                </span>
                {server.config?.description && (
                  <p className="truncate text-xs text-text-secondary">
                    {server.config.description}
                  </p>
                )}
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-xheavy bg-transparent',
                )}
              >
                {isSelected && <Check className="h-4 w-4" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
