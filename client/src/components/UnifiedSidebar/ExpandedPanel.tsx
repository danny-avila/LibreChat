import { memo, lazy, Suspense } from 'react';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useLocalize } from '~/hooks';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function ExpandedPanel({
  links,
  defaultActive,
  onCollapse,
  resize,
}: {
  links: NavLink[];
  defaultActive?: string;
  onCollapse: () => void;
  resize?: (size: number) => void;
}) {
  const localize = useLocalize();

  return (
    <div className="flex h-full flex-col bg-surface-primary-alt">
      <div className="px-1 py-1">
        <TooltipAnchor
          side="right"
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label={localize('com_nav_close_sidebar')}
              aria-expanded={true}
              className="h-9 w-9 flex-shrink-0 rounded-lg"
              onClick={onCollapse}
            >
              <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
            </Button>
          }
        />
      </div>

      <nav
        className="min-h-0 flex-1 overflow-hidden"
        aria-label={localize('com_nav_control_panel')}
      >
        <SidePanelNav
          links={links}
          isCollapsed={false}
          resize={resize}
          defaultActive={defaultActive}
        />
      </nav>

      <div className="px-1 py-1">
        <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
