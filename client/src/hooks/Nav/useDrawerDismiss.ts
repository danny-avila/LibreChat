import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { MouseEvent, RefObject } from 'react';
import { MOBILE_DRAWER_ID, TRANSITION_MS } from '~/components/UnifiedSidebar/constants';
import { OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { getDrawerAnimationStartedAt } from './useDrawerSwipe';

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

  /** Layout rather than passive: the guard below has to be armed in the frame
   *  the close commits. A passive effect runs after paint, leaving one frame
   *  where the pane has dropped `inert` and the scrim has not yet taken the
   *  pointer back, which is a tap reaching a control still sliding past. */
  useLayoutEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    const wasSmallScreen = wasSmallScreenRef.current;
    wasExpandedRef.current = expanded;
    wasSmallScreenRef.current = isSmallScreen;

    /** Leaving mobile unmounts the drawer and the scrim, so focus sitting on
     *  either goes with them, exactly as it does on a close. */
    if (wasSmallScreen && !isSmallScreen) {
      restoreDrawerFocus(paneRef.current);
      return;
    }

    if (!isSmallScreen || !wasExpanded || expanded) {
      return;
    }

    const remaining = closeGuardDuration({
      wasSmallScreen,
      prefersReducedMotion,
      pane: paneRef.current,
    });

    /** Nothing is still moving, so the pane never takes `inert` back and the
     *  handoff can land in this frame. Runs for a breakpoint crossing too: the
     *  expanded desktop sidebar is replaced by the closed mobile drawer, so
     *  focus inside it is dropped just as surely as by a deliberate close. */
    if (remaining == null) {
      restoreDrawerFocus(paneRef.current);
      return;
    }

    /** Timer rather than transitionend: the scrim unmounts when the viewport
     *  crosses to desktop, and a handler that never fires would strand the
     *  guard on. */
    setIsClosing(true);
    const id = setTimeout(() => {
      /** The guard puts `inert` back on the pane, and both the opener and the
       *  pane itself sit inside it, so a handoff at the commit would only be
       *  dropped to the body with nothing left to re-run it. Flush the release
       *  first, so the attribute is off the DOM before focus moves. */
      flushSync(() => setIsClosing(false));
      restoreDrawerFocus(paneRef.current);
    }, remaining);
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
 * How much of the close is still moving, or null when nothing is. Crossing the
 * breakpoint derives the drawer closed with nothing to animate, and both
 * surfaces snap under reduced motion; arming anyway would leave a transparent
 * full-screen scrim swallowing taps for the length of the guard.
 */
function closeGuardDuration({
  wasSmallScreen,
  prefersReducedMotion,
  pane,
}: {
  wasSmallScreen: boolean;
  prefersReducedMotion: boolean;
  pane: HTMLElement | null;
}): number | null {
  if (!wasSmallScreen || prefersReducedMotion) {
    return null;
  }

  /** The guard exists to cover anything still moving. The reveal close
   *  repositions the pane instantly (`transition: none`) while the drawer keeps
   *  sliding, and a swipe animates the pane at any width, so asking only one
   *  surface misses a path. */
  const paneTransition = pane?.style.transition ?? '';
  const drawerTransition = document.getElementById(MOBILE_DRAWER_ID)?.style.transition ?? '';
  const stillMoving = (transition: string) => transition !== '' && transition !== 'none';
  if (!stillMoving(paneTransition) && !stillMoving(drawerTransition)) {
    return null;
  }

  /** The slide started at kick time. A delayed Recoil commit must not add a
   *  fresh TRANSITION_MS after the compositor has already settled. */
  const startedAt = getDrawerAnimationStartedAt();
  const remaining =
    startedAt == null
      ? TRANSITION_MS
      : Math.max(0, TRANSITION_MS - (performance.now() - startedAt));
  return remaining === 0 ? null : remaining;
}

/**
 * The drawer goes `inert` and the scrim `aria-hidden`, so whichever control
 * closed the drawer stops being focusable. Inert drops focus to the body on its
 * own; `aria-hidden` does not, which is what Escape on a focused scrim leaves
 * behind. Anything that took focus deliberately, a composer autofocused after
 * picking a conversation, keeps it.
 */
function restoreDrawerFocus(pane: HTMLElement | null): void {
  const active = document.activeElement;
  const lost =
    !(active instanceof HTMLElement) ||
    active === document.body ||
    active.closest('[inert]') != null ||
    active.closest('[aria-hidden="true"]') != null;
  if (!lost) {
    return;
  }

  const opener = document.getElementById(OPEN_SIDEBAR_ID);
  if (opener != null) {
    opener.focus();
    /** It stays mounted across breakpoints but is hidden on desktop, where the
     *  focus simply does not take, so confirm it rather than assume it. */
    if (document.activeElement === opener) {
      return;
    }
  }

  /** Routes that return a loading or error state before rendering their header
   *  have no opener, while the shortcut and the pane swipe still open the
   *  drawer, so fall back to the pane rather than leaving focus on the body. */
  pane?.focus();
}
