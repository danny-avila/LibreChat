import { memo, lazy, Suspense } from 'react';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel } from '~/Providers';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function ExpandedPanel({ links, onCollapse }: { links: NavLink[]; onCollapse: () => void }) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();

  return (
    <div className="flex h-full bg-surface-primary-alt">
      <div className="flex h-full w-[50px] flex-shrink-0 flex-col border-r border-border-light">
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
                className="h-9 w-9 rounded-lg"
                onClick={onCollapse}
              >
                <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
              </Button>
            }
          />
        </div>

        <div className="flex flex-col gap-0.5 overflow-y-auto px-1">
          {links.map((link, index) => (
            <TooltipAnchor
              key={`nav-icon-${index}`}
              description={localize(link.title)}
              side="right"
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={localize(link.title)}
                  aria-pressed={link.id === active}
                  className={cn(
                    'h-9 w-9 rounded-lg',
                    link.id === active
                      ? 'bg-surface-active-alt text-text-primary'
                      : 'text-text-secondary',
                  )}
                  onClick={(e) => {
                    if (link.onClick) {
                      link.onClick(e);
                      setActive('');
                      return;
                    }
                    setActive(link.id === active ? '' : link.id);
                  }}
                >
                  <link.icon className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
          ))}
        </div>

        <div className="mt-auto px-1 py-1">
          <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
            <AccountSettings collapsed />
          </Suspense>
        </div>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-hidden"
        aria-label={localize('com_nav_control_panel')}
      >
        <SidePanelNav links={links} />
      </nav>
    </div>
  );
}

export default memo(ExpandedPanel);
