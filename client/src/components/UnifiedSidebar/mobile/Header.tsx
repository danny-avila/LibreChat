import { memo, lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import { Button, Skeleton } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useShortcutAriaKey } from '~/hooks/useKeyboardShortcuts';
import { useLocalize } from '~/hooks';
import Switcher from './Switcher';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/**
 * At full width there is nothing beside the drawer left to tap, so this close
 * button is the primary dismissal. It keeps `CLOSE_SIDEBAR_ID` because
 * `OpenSidebar` focuses that id shortly after opening.
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
      <Switcher links={links} />
      <Suspense fallback={<Skeleton className="size-9 rounded-lg" />}>
        <AccountSettings collapsed />
      </Suspense>
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
        variant="ghost"
        aria-label={localize('com_nav_close_sidebar')}
        aria-expanded={expanded}
        /** The only close control while open, so its binding must be discoverable here. */
        aria-keyshortcuts={toggleSidebarAriaKey}
        tabIndex={expanded ? 0 : -1}
        className="size-10 flex-shrink-0 rounded-lg"
        onClick={onClose}
      >
        <X className="size-5 text-text-primary" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default memo(Header);
