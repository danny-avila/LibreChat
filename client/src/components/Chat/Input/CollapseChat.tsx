import React from 'react';
import { Minimize2 } from 'lucide-react';
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

  if (isCollapsed) {
    return null;
  }

  return (
    <TooltipAnchor
      role="button"
      description={localize('com_ui_collapse_chat')}
      aria-label={localize('com_ui_collapse_chat')}
      onClick={() => setIsCollapsed(true)}
      className={cn(
        'absolute right-2 top-2 z-10 size-[35px] rounded-full p-2 transition-colors',
        'hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
      )}
    >
      <Minimize2 className="h-full w-full" />
    </TooltipAnchor>
  );
};

export default CollapseChat;
