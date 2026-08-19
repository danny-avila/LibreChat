import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSITION_MS } from '~/components/UnifiedSidebar/constants';
import { OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';

import type { MouseEvent, RefObject } from 'react';

/**
 * Every path that closes the mobile drawer leaves the same two problems, so
 * they are answered once here rather than per control: the surfaces the user
 * acted on stop being focusable, and the drawer and pane keep moving after the
 * state has already committed.
 */
export default function useDrawerDismiss({
  expanded,
  isSmallScreen,
  prefersReducedMotion,
  paneRef,
  setOpen,
}: {
  expanded: boolean;
  isSmallScreen: boolean;
  prefersReducedMotion: boolean;
  paneRef: RefObject<HTMLElement>;
  setOpen: (open: boolean) => void;
}): {
  isClosing: boolean;
  onScrimClick: (event: MouseEvent<HTMLElement>) => void;
} {
  /** The commit lands on the third frame but the drawer and pane keep moving
   *  for the rest of the transition, so the scrim has to stay the pointer
   *  target until then; otherwise a tap during the close reaches a control on
   *  the pane sliding underneath. */
  const [isClosing, setIsClosing] = useState(false);
  const wasExpandedRef = useRef(expanded);
  const wasSmallScreenRef = useRef(isSmallScreen);

  useEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    const wasSmallScreen = wasSmallScreenRef.current;
    wasExpandedRef.current = expanded;
    wasSmallScreenRef.current = isSmallScreen;

    /** Crossing the breakpoint derives the drawer closed with nothing to
     *  animate, so reading it as a close would leave a transparent
     *  full-screen scrim swallowing taps for the whole guard. */
    if (!isSmallScreen || !wasSmallScreen || !wasExpanded || expanded) {
      return;
    }

    restoreDrawerFocus(paneRef.current);

    /** Both surfaces snap under reduced motion, so nothing is still moving. */
    if (prefersReducedMotion) {
      return;
    }

    /** Timer rather than transitionend: the scrim unmounts when the viewport
     *  crosses to desktop, and a handler that never fires would strand the
     *  guard on. */
    setIsClosing(true);
    const id = setTimeout(() => setIsClosing(false), TRANSITION_MS);
    return () => {
      clearTimeout(id);
      setIsClosing(false);
    };
  }, [expanded, isSmallScreen, prefersReducedMotion, paneRef]);

  const onScrimClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      /** The scrim goes aria-hidden on close, so focus cannot stay here; the
       *  effect above hands it on once the pane has shed `inert`. */
      event.currentTarget.blur();
      /** Still the pointer target through the guard, where closing again would
       *  be a no-op that never reaches that effect. */
      if (!expanded) {
        return;
      }
      setOpen(false);
    },
    [expanded, setOpen],
  );

  return { isClosing, onScrimClick };
}

/**
 * The drawer goes `inert` and the scrim `aria-hidden`, so whichever control
 * closed the drawer stops being focusable and the browser drops focus to the
 * body. Anything that took focus deliberately, a composer autofocused after
 * picking a conversation, keeps it.
 */
function restoreDrawerFocus(pane: HTMLElement | null): void {
  const active = document.activeElement;
  const lost =
    !(active instanceof HTMLElement) ||
    active === document.body ||
    active.closest('[inert]') != null;
  if (!lost) {
    return;
  }

  const opener = document.getElementById(OPEN_SIDEBAR_ID);
  if (opener != null) {
    opener.focus();
    return;
  }

  /** Routes that return a loading or error state before rendering their header
   *  have no opener, while the shortcut and the pane swipe still open the
   *  drawer, so fall back to the pane rather than leaving focus on the body. */
  pane?.focus();
}
