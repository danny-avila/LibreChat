import { memo, lazy, Suspense } from 'react';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function ExpandedPanel({
  links,
  expanded = true,
  onCollapse,
  onExpand,
  onExpandToSection,
}: {
  links: NavLink[];
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  onExpandToSection?: (sectionId: string) => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();

  const toggleLabel = expanded ? 'com_nav_close_sidebar' : 'com_nav_open_sidebar';

  return (
    <div className="flex h-full flex-shrink-0 flex-col gap-2 border-r border-border-light bg-surface-primary-alt px-2 py-2">
      <TooltipAnchor
        side="right"
        description={localize(toggleLabel)}
        render={
          <Button
            size="icon"
            variant="ghost"
            aria-label={localize(toggleLabel)}
            aria-expanded={expanded}
            className="h-9 w-9 rounded-lg"
            onClick={expanded ? onCollapse : onExpand}
          >
            <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
          </Button>
        }
      />

      <div className="flex flex-col gap-1 overflow-y-auto">
        {links.map((link) => (
          <TooltipAnchor
            key={link.id}
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
                    return;
                  }
                  if (expanded) {
                    if (link.id !== active) {
                      setActive(link.id);
                    }
                  } else {
                    onExpandToSection?.(link.id);
                  }
                }}
              >
                <link.icon className="h-4 w-4" aria-hidden="true" />
              </Button>
            }
          />
        ))}
      </div>

      <div className="mt-auto">
        <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
