import React from 'react';
import { Clock4 } from 'lucide-react';
import { cn } from '~/utils';

export default function MentionItem({
  name,
  onClick,
  index,
  icon,
  isActive,
  description,
}: {
  name: string;
  onClick: () => void;
  index: number;
  icon?: React.ReactNode;
  isActive?: boolean;
  description?: string;
}) {
  return (
    <div tabIndex={index} onClick={onClick} id={`mention-item-${index}`} className="cursor-pointer">
      <div
        className={cn(
          'text-token-text-primary bg-token-main-surface-secondary group flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-600',
          isActive ? 'bg-gray-100 dark:bg-gray-600' : '',
        )}
      >
        {icon ? icon : null}
        <div className="flex h-fit grow flex-row justify-between space-x-2 overflow-hidden text-ellipsis whitespace-nowrap">
          <div className="flex flex-row space-x-2">
            <span className="shrink-0 truncate">{name}</span>
            {description ? (
              <span className="text-token-text-tertiary flex-grow truncate text-sm font-light sm:max-w-xs lg:max-w-md">
                {description}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 self-center">
            <Clock4 size={16} className="icon-sm" />
          </span>
        </div>
      </div>
    </div>
  );
}
