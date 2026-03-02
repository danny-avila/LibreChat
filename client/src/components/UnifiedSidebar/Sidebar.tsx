import { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
  onExpandToSection,
  onResizeStart,
  setSidebarWidth,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onExpandToSection: (sectionId: string) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
}) {
  const localize = useLocalize();

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        <ExpandedPanel
          links={links}
          expanded={expanded}
          onCollapse={onCollapse}
          onExpand={onExpand}
          onExpandToSection={onExpandToSection}
        />
        <nav
          className={cn(
            'min-h-0 flex-1 overflow-hidden bg-surface-primary-alt',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
          aria-label={localize('com_nav_control_panel')}
          aria-hidden={!expanded}
        >
          <SidePanelNav links={links} />
        </nav>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={expanded ? 0 : -1}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy',
          expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
        onMouseDown={onResizeStart}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setSidebarWidth((w) => {
              const next = Math.max(w - 20, 220);
              localStorage.setItem('side:width', String(next));
              return next;
            });
          } else if (e.key === 'ArrowRight') {
            setSidebarWidth((w) => {
              const next = Math.min(w + 20, window.innerWidth * 0.4);
              localStorage.setItem('side:width', String(Math.round(next)));
              return next;
            });
          }
        }}
      />
    </>
  );
}

export default memo(Sidebar);
