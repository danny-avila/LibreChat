import { TooltipAnchor, Button, Sidebar } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Element ID for the close sidebar button - used for focus management */
export const CLOSE_SIDEBAR_ID = 'close-sidebar-button';
/** Element ID for the open sidebar button - used for focus management */
export const OPEN_SIDEBAR_ID = 'open-sidebar-button';

export default function OpenSidebar({
  setNavVisible,
  className,
}: {
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
  className?: string;
}) {
  const localize = useLocalize();

  const handleClick = () => {
    setNavVisible((prev) => {
      localStorage.setItem('navVisible', JSON.stringify(!prev));
      return !prev;
    });
    // Delay focus until after the sidebar animation completes (200ms)
    setTimeout(() => {
      document.getElementById(CLOSE_SIDEBAR_ID)?.focus();
    }, 250);
  };

  return (
    <TooltipAnchor
      description={localize('com_nav_open_sidebar')}
      render={
        <Button
          id={OPEN_SIDEBAR_ID}
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
}
