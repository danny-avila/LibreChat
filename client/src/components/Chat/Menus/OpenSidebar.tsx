import { startTransition } from 'react';
import { useSetRecoilState } from 'recoil';
import { TooltipAnchor, Button, Sidebar } from '@librechat/client';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export const CLOSE_SIDEBAR_ID = 'close-sidebar-button';
export const OPEN_SIDEBAR_ID = 'open-sidebar-button';

export default function OpenSidebar({ className }: { className?: string }) {
  const localize = useLocalize();
  const setSidebarExpanded = useSetRecoilState(store.sidebarExpanded);
  const tooltipDescription = useShortcutHint('toggleSidebar', localize('com_nav_open_sidebar'));
  const ariaKey = useShortcutAriaKey('toggleSidebar');

  const handleClick = () => {
    startTransition(() => {
      setSidebarExpanded(true);
    });
    setTimeout(() => {
      document.getElementById(CLOSE_SIDEBAR_ID)?.focus();
    }, 250);
  };

  return (
    <TooltipAnchor
      description={tooltipDescription}
      render={
        <Button
          id={OPEN_SIDEBAR_ID}
          size="icon"
          variant="outline"
          data-testid="open-sidebar-button"
          aria-label={localize('com_nav_open_sidebar')}
          aria-expanded={false}
          aria-controls="chat-history-nav"
          aria-keyshortcuts={ariaKey}
          className={cn(
            'rounded-xl bg-presentation duration-0 hover:bg-surface-active-alt',
            className,
          )}
          onClick={handleClick}
        >
          <Sidebar className="icon-md" aria-hidden="true" />
        </Button>
      }
    />
  );
}
