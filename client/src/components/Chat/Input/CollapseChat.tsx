import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TooltipAnchor } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const CollapseChat = ({
  isScrollable,
  isCollapsed,
  setIsCollapsed,
}: {
  isScrollable: boolean;
  isCollapsed: boolean;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const localize = useLocalize();
  if (!isScrollable) {
    return null;
  }

  const description = isCollapsed
    ? localize('com_ui_expand_chat')
    : localize('com_ui_collapse_chat');

  return (
    <div className="relative ml-auto items-end justify-end">
      <TooltipAnchor
        description={description}
        render={
          <button
            aria-label={description}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsCollapsed((prev) => !prev);
            }}
            className={cn(
              // 'absolute right-1.5 top-1.5',
              'z-10 size-5 rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            )}
          >
            {isCollapsed ? (
              <ChevronUp className="h-full w-full" />
            ) : (
              <ChevronDown className="h-full w-full" />
            )}
          </button>
        }
      />
    </div>
  );
};

export default CollapseChat;
