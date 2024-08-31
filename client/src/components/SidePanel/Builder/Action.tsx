import { useState } from 'react';
import type { Action } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';

export default function Action({ action, onClick }: { action: Action; onClick: () => void }) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div>
      <div
        onClick={onClick}
        className="flex w-full rounded-lg text-sm hover:cursor-pointer"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div
          className="h-9 grow whitespace-nowrap px-3 py-2"
          style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
        >
          {action.metadata.domain}
        </div>
        {isHovering && (
          <button
            type="button"
            className="transition-colors flex h-9 w-9 min-w-9 items-center justify-center rounded-lg duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <GearIcon className="icon-sm" />
          </button>
        )}
      </div>
    </div>
  );
}
