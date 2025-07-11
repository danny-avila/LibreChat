import { useState } from 'react';
import type { Action } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';
import { cn } from '~/utils';

export default function Action({
  action,
  onClick,
  readonly = false,
}: {
  action: Action;
  onClick: () => void;
  readonly?: boolean;
}) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div
      role="button"
      tabIndex={readonly ? -1 : 0}
      onClick={readonly ? undefined : onClick}
      onKeyDown={(e) => {
        if (!readonly && (e.key === 'Enter' || e.key === ' ')) {
          onClick();
        }
      }}
      className={cn(
        'group flex w-full rounded-lg border border-border-medium text-sm focus:outline-none focus:ring-2 focus:ring-text-primary',
        readonly ? 'cursor-default opacity-75' : 'hover:cursor-pointer',
      )}
      onMouseEnter={() => !readonly && setIsHovering(true)}
      onMouseLeave={() => !readonly && setIsHovering(false)}
      aria-label={`Action for ${action.metadata.domain}`}
    >
      <div
        className="h-9 grow overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2"
        style={{ wordBreak: 'break-all' }}
      >
        {action.metadata.domain}
      </div>
      {!readonly && (
        <div
          className={cn(
            'h-9 w-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-text-primary group-focus:flex',
            isHovering ? 'flex' : 'hidden',
          )}
          aria-label="Settings"
        >
          <GearIcon className="icon-sm" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
