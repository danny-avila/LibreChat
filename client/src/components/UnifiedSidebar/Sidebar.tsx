import { memo } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useBranding } from '~/hooks';
import ExpandedPanel from './ExpandedPanel';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
  onResizeStart,
  onResizeKeyboard,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeKeyboard: (direction: 'shrink' | 'grow') => void;
}) {
  const branding = useBranding();
  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        <ExpandedPanel
          links={links}
          expanded={expanded}
          onCollapse={onCollapse}
          onExpand={onExpand}
        />
        <nav
          className={cn(
            'min-h-0 flex-1 overflow-hidden bg-surface-primary-alt',
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{ transition: expanded ? 'opacity 200ms ease 80ms' : 'opacity 150ms ease' }}
          aria-hidden={!expanded}
        >
          <div className="flex items-center gap-2 px-4 pb-1 pt-3">
            <img src={branding.logoPath} alt={branding.logoAlt} className="h-8 w-8 rounded-lg" />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-primary">{branding.appName}</span>
              {branding.appSubtitle && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-text-secondary">
                  {branding.appSubtitle}
                </span>
              )}
            </div>
          </div>
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
            onResizeKeyboard('shrink');
          } else if (e.key === 'ArrowRight') {
            onResizeKeyboard('grow');
          }
        }}
      />
    </>
  );
}

export default memo(Sidebar);
