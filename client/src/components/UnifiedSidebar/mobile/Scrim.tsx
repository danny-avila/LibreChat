import type { MouseEvent } from 'react';
import { DRAWER_Z_INDEX, TRANSITION_MS, EASING } from '../constants';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Covers the strip of conversation the drawer leaves visible, and dismisses it
 * when tapped. Rendered as a sibling of the chat pane rather than inside it,
 * because the pane is inert while the drawer is open and would swallow the
 * click.
 */
export default function Scrim({
  expanded,
  isClosing,
  prefersReducedMotion,
  onClick,
}: {
  expanded: boolean;
  /** The drawer and pane keep moving after the state commits, and a tap in that
   *  window would otherwise reach a control on the pane sliding underneath. */
  isClosing: boolean;
  prefersReducedMotion: boolean;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}) {
  const localize = useLocalize();

  return (
    <button
      type="button"
      aria-label={localize('com_nav_close_sidebar')}
      onClick={onClick}
      tabIndex={expanded ? 0 : -1}
      aria-hidden={!expanded || undefined}
      className={cn(
        'absolute inset-0 bg-surface-overlay/50',
        expanded ? 'opacity-100' : 'opacity-0',
        !expanded && !isClosing && 'pointer-events-none',
      )}
      style={{
        zIndex: DRAWER_Z_INDEX - 1,
        transition: prefersReducedMotion ? undefined : `opacity ${TRANSITION_MS}ms ${EASING}`,
      }}
    />
  );
}
