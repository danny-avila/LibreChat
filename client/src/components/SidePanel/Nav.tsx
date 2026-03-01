import { TooltipAnchor, Button } from '@librechat/client';
import type { NavProps } from '~/common';
import { ActivePanelProvider, useActivePanel } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function NavContent({ links, isCollapsed, resize }: Omit<NavProps, 'defaultActive'>) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();

  if (isCollapsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-0.5 px-2 py-1">
        {links.map((link, index) => (
          <TooltipAnchor
            description={localize(link.title)}
            side="right"
            key={`nav-link-${index}`}
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  if (link.onClick) {
                    link.onClick(e);
                    setActive('');
                    return;
                  }
                  setActive(link.id);
                  resize && resize(25);
                }}
              >
                <link.icon className="h-4 w-4 text-text-secondary" />
                <span className="sr-only">{localize(link.title)}</span>
              </Button>
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-col items-center gap-0.5 overflow-y-auto px-1 py-1">
        {links.map((link, index) => (
          <TooltipAnchor
            key={`nav-icon-${index}`}
            description={localize(link.title)}
            side="right"
            render={
              <button
                type="button"
                aria-label={localize(link.title)}
                aria-pressed={link.id === active}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors hover:bg-surface-active-alt focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
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
              </button>
            }
          />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {links.map((link) =>
          link.id === active && link.Component ? <link.Component key={link.id} /> : null,
        )}
      </div>
    </div>
  );
}

export default function Nav({ links, isCollapsed, resize, defaultActive }: NavProps) {
  return (
    <ActivePanelProvider defaultActive={defaultActive}>
      <NavContent links={links} isCollapsed={isCollapsed} resize={resize} />
    </ActivePanelProvider>
  );
}
