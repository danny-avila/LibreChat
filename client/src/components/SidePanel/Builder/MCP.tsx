import { useState } from 'react';
import type { MCP } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';
import MCPIcon from '~/components/svg/MCPIcon';
import { cn } from '~/utils';

type MCPProps = {
  mcp: MCP;
  onClick: () => void;
};

export default function MCP({ mcp, onClick }: MCPProps) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
      className="group flex w-full rounded-lg border border-border-medium text-sm hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-text-primary"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={`MCP for ${mcp.metadata.name}`}
    >
      <div className="flex h-9 items-center gap-2 px-3">
        {mcp.metadata.icon ? (
          <img
            src={mcp.metadata.icon}
            alt={`${mcp.metadata.name} icon`}
            className="h-6 w-6 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-secondary">
            <MCPIcon />
          </div>
        )}
        <div
          className="grow overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ wordBreak: 'break-all' }}
        >
          {mcp.metadata.name}
        </div>
      </div>
      <div
        className={cn(
          'ml-auto h-9 w-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-text-primary group-focus:flex',
          isHovering ? 'flex' : 'hidden',
        )}
        aria-label="Settings"
      >
        <GearIcon className="icon-sm" aria-hidden="true" />
      </div>
    </div>
  );
}
