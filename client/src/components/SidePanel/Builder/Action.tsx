import { useState } from 'react';
import type { Action } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';
import { cn } from '~/utils';

export default function Action({ action, onClick }: { action: Action; onClick: () => void }) {
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
      className="flex w-full rounded-lg text-sm hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-text-primary"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      aria-label={`Action for ${action.metadata.domain}`}
    >
      <div
        className="h-9 grow overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2"
        style={{ wordBreak: 'break-all' }}
      >
        {action.metadata.domain}
      </div>
      <div
        className={cn(
          'flex h-9 w-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-text-primary',
          isHovering ? 'flex' : 'hidden',
        )}
        aria-label="Settings"
      >
        <GearIcon className="icon-sm" aria-hidden="true" />
      </div>
    </div>
  );
}
