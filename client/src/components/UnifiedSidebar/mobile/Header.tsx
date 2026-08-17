import { memo, lazy, Suspense } from 'react';
import { Button, Sidebar, Skeleton } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID, SIDEBAR_TOGGLE_CLASSES } from '~/components/Chat/Menus/OpenSidebar';
import { useShortcutAriaKey } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import Switcher from './Switcher';
import { cn } from '~/utils';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/**
 * At full width there is nothing beside the drawer left to tap, so this close
 * button is the primary dismissal. It mirrors the chat header's `OpenSidebar`
 * toggle — same icon, same look, same far-left slot — so opening the drawer
 * reads as the one persistent control flipping state, not a new X appearing
 * elsewhere. It keeps `CLOSE_SIDEBAR_ID` because `OpenSidebar` focuses that id
 * shortly after opening.
 */
function Header({
  links,
  expanded,
  onClose,
}: {
  links: NavLink[];
  expanded: boolean;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const toggleSidebarAriaKey = useShortcutAriaKey('toggleSidebar');

  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border-light px-2">
      <Button
        /**
         * The drawer stays mounted while closed so it can slide, and a
         * translated element still counts as visible. Only claim the close
         * identity while open, or callers that probe for it act on a control
         * sitting off-viewport.
         */
        id={expanded ? CLOSE_SIDEBAR_ID : undefined}
        data-testid={expanded ? 'close-sidebar-button' : undefined}
        size="icon"
        variant="outline"
        aria-label={localize('com_nav_close_sidebar')}
        aria-expanded={expanded}
        aria-controls="chat-history-nav"
        /** The only close control while open, so its binding must be discoverable here. */
        aria-keyshortcuts={toggleSidebarAriaKey}
        tabIndex={expanded ? 0 : -1}
        className={cn('flex-shrink-0', SIDEBAR_TOGGLE_CLASSES)}
        onClick={onClose}
      >
        <Sidebar className="icon-md" aria-hidden="true" />
      </Button>
      <Switcher links={links} />
      <Suspense fallback={<Skeleton className="size-9 rounded-lg" />}>
        <AccountSettings collapsed />
      </Suspense>
    </div>
  );
}

export default memo(Header);
