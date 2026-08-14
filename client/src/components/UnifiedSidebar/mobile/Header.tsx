import { memo, lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import { Button, Skeleton } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize } from '~/hooks';
import Switcher from './Switcher';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/**
 * At full width there is nothing beside the drawer left to tap, so this close
 * button is the primary dismissal. It keeps `CLOSE_SIDEBAR_ID` because
 * `OpenSidebar` focuses that id shortly after opening.
 */
function Header({ links, onClose }: { links: NavLink[]; onClose: () => void }) {
  const localize = useLocalize();

  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border-light px-2">
      <Switcher links={links} />
      <Suspense fallback={<Skeleton className="size-9 rounded-lg" />}>
        <AccountSettings collapsed />
      </Suspense>
      <Button
        id={CLOSE_SIDEBAR_ID}
        data-testid="close-sidebar-button"
        size="icon"
        variant="ghost"
        aria-label={localize('com_nav_close_sidebar')}
        aria-expanded={true}
        className="size-10 flex-shrink-0 rounded-lg"
        onClick={onClose}
      >
        <X className="size-5 text-text-primary" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default memo(Header);
