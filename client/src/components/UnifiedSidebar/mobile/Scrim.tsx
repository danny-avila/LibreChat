import type { MouseEvent } from 'react';
import { DRAWER_Z_INDEX, MOBILE_SCRIM_ID, TRANSITION_MS, EASING } from '../constants';
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
      id={MOBILE_SCRIM_ID}
      type="button"
      aria-label={localize('com_nav_close_sidebar')}
      onClick={onClick}
      tabIndex={expanded ? 0 : -1}
      aria-hidden={!expanded || undefined}
      className={cn(
        'absolute inset-0 bg-surface-overlay/50',
        /** Inset: the shell is overflow-hidden, and the global :focus-visible
         *  outline sits 2px outside the box, which the shell would clip. */
        'outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary',
        !expanded && !isClosing && 'pointer-events-none',
      )}
      style={{
        zIndex: DRAWER_Z_INDEX - 1,
        /** Style rather than a class so a kicked fade (inline opacity written
         *  at animation start) is not interrupted when Recoil commits the
         *  matching value three frames later. */
        opacity: expanded ? 1 : 0,
        transition: prefersReducedMotion ? undefined : `opacity ${TRANSITION_MS}ms ${EASING}`,
      }}
    />
  );
}
