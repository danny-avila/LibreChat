import { lazy, Suspense } from 'react';
import { Sidebar, TooltipAnchor, Button, Skeleton } from '@librechat/client';
import type { NavLink } from '~/common';
import { useLocalize } from '~/hooks';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function CollapsedBar({
  links,
  onExpand,
  onExpandToSection,
}: {
  links: NavLink[];
  onExpand: () => void;
  onExpandToSection: (sectionId: string) => void;
}) {
  const localize = useLocalize();

  return (
    <div className="flex h-full w-full flex-col border-r border-border-light bg-surface-primary-alt">
      <div className="px-1 py-1">
        <TooltipAnchor
          side="right"
          description={localize('com_nav_open_sidebar')}
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label={localize('com_nav_open_sidebar')}
              aria-expanded={false}
              className="h-9 w-9 rounded-lg"
              onClick={onExpand}
            >
              <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto px-1">
        {links.map((link, index) => (
          <TooltipAnchor
            key={`collapsed-${index}`}
            side="right"
            description={localize(link.title)}
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={localize(link.title)}
                className="h-9 w-9 rounded-lg"
                onClick={(e) => {
                  if (link.onClick) {
                    link.onClick(e);
                    return;
                  }
                  onExpandToSection(link.id);
                }}
              >
                <link.icon className="h-4 w-4 text-text-secondary" />
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
  );
}

export default CollapsedBar;
