import { forwardRef } from 'react';
import { TooltipAnchor, Button, Sidebar } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const OpenSidebar = forwardRef<
  HTMLButtonElement,
  {
    setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
    className?: string;
    closeSidebarRef?: React.RefObject<HTMLButtonElement>;
  }
>(({ setNavVisible, className, closeSidebarRef }, ref) => {
  const localize = useLocalize();

  const handleClick = () => {
    setNavVisible((prev) => {
      localStorage.setItem('navVisible', JSON.stringify(!prev));
      return !prev;
    });
    requestAnimationFrame(() => {
      closeSidebarRef?.current?.focus();
    });
  };

  return (
    <TooltipAnchor
      description={localize('com_nav_open_sidebar')}
      render={
        <Button
          ref={ref}
          size="icon"
          variant="outline"
          data-testid="open-sidebar-button"
          aria-label={localize('com_nav_open_sidebar')}
          aria-expanded={false}
          aria-controls="chat-history-nav"
          className={cn(
            'rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover',
            className,
          )}
          onClick={handleClick}
        >
          <Sidebar aria-hidden="true" />
        </Button>
      }
    />
  );
});

OpenSidebar.displayName = 'OpenSidebar';

export default OpenSidebar;
