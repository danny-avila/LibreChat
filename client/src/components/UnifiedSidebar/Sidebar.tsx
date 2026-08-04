import { memo } from 'react';
import type { NavLink } from '~/common';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useIsExodeEmbed } from '~/components/Exode';
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
  const isExodeEmbed = useIsExodeEmbed();

  return (
    <>
      <div className="flex h-full w-full overflow-hidden">
        {/* The exode embed keeps the conversation list but drops the icon rail: the
            embedded chat is only ever a chat + its history, and every rail
            destination (agents, files, prompts, memories, account) is chrome the
            host app owns. */}
        {!isExodeEmbed && (
          <ExpandedPanel
            links={links}
            expanded={expanded}
            onCollapse={onCollapse}
            onExpand={onExpand}
          />
        )}
        {/* Collapsed hover affordance for the embed: without it the closed sidebar is a
            blank strip with no hint that the history is behind it. The <aside> owns the
            hover handler, so this only has to be visible, never interactive. */}
        {isExodeEmbed && !expanded && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex w-full items-center justify-center"
            aria-hidden="true"
          >
            <div className="h-10 w-1 rounded-full bg-border-medium" />
          </div>
        )}
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
      {/* No resize in the embed: its width is fixed by the hover-open behaviour, so a drag
          handle would only fight it (and the pointer leaving mid-drag closes the sidebar). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabIndex={expanded && !isExodeEmbed ? 0 : -1}
        className={cn(
          'absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy',
          expanded && !isExodeEmbed ? 'opacity-100' : 'pointer-events-none opacity-0',
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
