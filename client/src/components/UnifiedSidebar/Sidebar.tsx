import { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { useLocalize } from '~/hooks';

function Sidebar({
  links,
  onCollapse,
  showExpanded,
  onResizeStart,
  setSidebarWidth,
}: {
  links: NavLink[];
  onCollapse: () => void;
  showExpanded: boolean;
  onResizeStart: (e: React.MouseEvent) => void;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
}) {
  const localize = useLocalize();

  return (
    <>
      <div className="flex h-full">
        <ExpandedPanel links={links} onCollapse={onCollapse} />

        {showExpanded && (
          <nav
            className="min-h-0 flex-1 overflow-hidden bg-surface-primary-alt"
            aria-label={localize('com_nav_control_panel')}
          >
            <SidePanelNav links={links} />
          </nav>
        )}
      </div>
      {showExpanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy"
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
      )}
    </>
  );
}

export default memo(Sidebar);
