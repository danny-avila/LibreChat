import { memo } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { cn } from '~/utils';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  return (
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
        <SidePanelNav links={links} />
      </nav>
    </div>
  );
}

export default memo(Sidebar);
