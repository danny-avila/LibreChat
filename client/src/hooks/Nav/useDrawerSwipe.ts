import { useEffect, useRef } from 'react';
import {
  TRANSITION_MS,
  MOBILE_DRAWER_ID,
  SIDEBAR_TRANSITION,
} from '~/components/UnifiedSidebar/constants';

/** Horizontal travel before the gesture claims the touch (also the tap filter). */
const ACTIVATION_DISTANCE = 10;
/** |dx| must beat |dy| by this ratio to claim; otherwise vertical scroll wins. */
const AXIS_LOCK_RATIO = 1.5;
/** Fraction of the drawer width past which release commits the open/close. */
const COMMIT_DISTANCE_RATIO = 0.35;
/** px/ms — a flick past this commits regardless of distance… */
const COMMIT_VELOCITY = 0.3;
/** …but never from a twitch shorter than this. */
const FLICK_MIN_DISTANCE = 24;
/** Inline styles are cleared this long after TRANSITION_MS, then classes own the state. */
const SETTLE_BUFFER_MS = 80;

/** Surfaces where a horizontal drag means selection or caret work, never navigation. */
const TEXT_SURFACE_SELECTOR = 'textarea, input, select, [contenteditable="true"]';

/**
 * Walks from `start` up to `boundary` looking for a horizontal scroller that
 * can still consume a pan in `direction` (1 = finger moving right, which
 * reveals content to the left, i.e. needs `scrollLeft > 0`). A rightward
 * swipe inside a code block only defers to the block while it can actually
 * scroll that way — parked at its edge, the drawer may claim the drag.
 */
export function findHorizontalScrollBlocker(
  start: Element | null,
  boundary: Element,
  direction: 1 | -1,
): Element | null {
  let node: Element | null = start;
  while (node != null) {
    if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth + 1) {
      const style = window.getComputedStyle(node);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        const maxScroll = node.scrollWidth - node.clientWidth;
        /** RTL scrollers report `scrollLeft` in [-max, 0] with 0 at the right
         * edge; normalize to visual distance-from-left-edge so the finger
         * direction maps the same way in both document directions. */
        const fromLeftEdge =
          style.direction === 'rtl' ? node.scrollLeft + maxScroll : node.scrollLeft;
        const remaining = direction === 1 ? fromLeftEdge : maxScroll - fromLeftEdge;
        if (remaining > 1) {
          return node;
        }
      }
    }
    if (node === boundary) {
      return null;
    }
    node = node.parentElement;
  }
  return null;
}

type DrawerSwipeOptions = {
  /** The chat pane that mirrors the drawer's motion (Root's Outlet wrapper). */
  paneRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Sample = { t: number; x: number };

type Gesture = {
  phase: 'tracking' | 'claimed' | 'dead';
  opening: boolean;
  startX: number;
  startY: number;
  dx: number;
  width: number;
  reducedMotion: boolean;
  drawer: HTMLElement;
  pane: HTMLElement;
  prevSample: Sample;
  lastSample: Sample;
  raf: number | null;
  /** Set before scheduling so coalescing holds even if rAF fires synchronously. */
  rafScheduled: boolean;
};

/** Returns every transient inline property to what React/classes render:
 * the drawer's transform is class-driven and the pane's is a React style
 * whose committed value React re-asserts whenever `open` changes. */
const releaseInlineStyles = (drawer: HTMLElement, pane: HTMLElement) => {
  drawer.style.transform = '';
  drawer.style.willChange = '';
  drawer.style.transition = SIDEBAR_TRANSITION;
  pane.style.transform = '';
  pane.style.willChange = '';
  pane.style.transition = SIDEBAR_TRANSITION;
};

const dragTransforms = (gesture: Gesture): { drawer: string; pane: string } => {
  const progress = gesture.opening
    ? Math.min(Math.max(gesture.dx, 0), gesture.width)
    : Math.min(Math.max(gesture.dx, -gesture.width), 0) + gesture.width;
  return {
    drawer: `translate3d(${progress - gesture.width}px, 0, 0)`,
    pane: `translate3d(${progress}px, 0, 0)`,
  };
};

/**
 * Follow-the-finger swipe between the mobile drawer and the chat pane, which
 * move as one object (see SIDEBAR_TRANSITION). Built on touch events with a
 * selectively non-passive `touchmove` — `touch-action` on the app shell would
 * silently kill every horizontal scroller in the chat (code blocks, tables,
 * carousels), and React's own onTouchMove registers passive, so
 * `preventDefault` there is a no-op. During a drag both elements get direct
 * rAF-coalesced transform writes and no React state changes; release animates
 * to the nearest state and only then flips `useSidebarState`.
 *
 * Open listens on the pane (portaled overlays mount to `body`, outside it) and
 * close on the drawer, which carries `touch-pan-y` since it has no horizontal
 * scrollers of its own. On an iOS Safari tab the system back gesture owns the
 * outer edge and is not preventable, which is exactly why activation is the
 * whole pane rather than an edge zone; installed standalone, the edge is ours.
 */
export default function useDrawerSwipe({
  paneRef,
  enabled,
  open,
  onOpenChange,
}: DrawerSwipeOptions) {
  const gestureRef = useRef<Gesture | null>(null);
  const settleRef = useRef<{ id: ReturnType<typeof setTimeout>; target: boolean } | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pane = paneRef.current;
    const drawer = document.getElementById(MOBILE_DRAWER_ID);
    if (pane == null || drawer == null) {
      return;
    }
    const opening = !open;
    const surface = opening ? pane : drawer;

    /** A settle whose target the world has since contradicted (drawer closed
     * via a button inside its 380ms window) must not fire — its stale write
     * would strand the pane offscreen with React believing nothing changed.
     * A settle that AGREES with `open` keeps running so its animation and
     * handoff finish undisturbed. */
    if (settleRef.current != null && settleRef.current.target !== open) {
      clearTimeout(settleRef.current.id);
      settleRef.current = null;
      releaseInlineStyles(drawer, pane);
    }

    const clearDrag = (gesture: Gesture) => {
      if (gesture.raf != null) {
        cancelAnimationFrame(gesture.raf);
      }
      gestureRef.current = null;
    };

    /** Animates both elements to `next`, flips state, then returns ownership
     * of every inline property to what React/classes render for that state. */
    const settle = (gesture: Gesture, next: boolean) => {
      clearDrag(gesture);
      if (gesture.reducedMotion) {
        if (next !== open) {
          onOpenChangeRef.current(next);
        }
        return;
      }
      const { drawer: drawerEl, pane: paneEl } = gesture;
      drawerEl.style.transition = SIDEBAR_TRANSITION;
      paneEl.style.transition = SIDEBAR_TRANSITION;
      drawerEl.style.transform = next ? 'translate3d(0, 0, 0)' : 'translate3d(-100%, 0, 0)';
      paneEl.style.transform = next ? 'translateX(100%)' : 'translate3d(0, 0, 0)';
      if (next !== open) {
        onOpenChangeRef.current(next);
      }
      const id = setTimeout(() => {
        settleRef.current = null;
        drawerEl.style.transform = '';
        drawerEl.style.willChange = '';
        drawerEl.style.transition = SIDEBAR_TRANSITION;
        paneEl.style.transform = next ? 'translateX(100%)' : 'none';
        paneEl.style.willChange = '';
        paneEl.style.transition = SIDEBAR_TRANSITION;
      }, TRANSITION_MS + SETTLE_BUFFER_MS);
      settleRef.current = { id, target: next };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (gestureRef.current != null || settleRef.current != null || event.touches.length !== 1) {
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest(TEXT_SURFACE_SELECTOR) != null) {
        return;
      }
      const touch = event.touches[0];
      const sample = { t: event.timeStamp, x: touch.clientX };
      gestureRef.current = {
        phase: 'tracking',
        opening,
        startX: touch.clientX,
        startY: touch.clientY,
        dx: 0,
        width: drawer.clientWidth || window.innerWidth,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        drawer,
        pane,
        prevSample: sample,
        lastSample: sample,
        raf: null,
        rafScheduled: false,
      };
    };

    const scheduleDragFrame = (gesture: Gesture) => {
      if (gesture.reducedMotion || gesture.rafScheduled) {
        return;
      }
      gesture.rafScheduled = true;
      gesture.raf = requestAnimationFrame(() => {
        gesture.rafScheduled = false;
        gesture.raf = null;
        const transforms = dragTransforms(gesture);
        gesture.drawer.style.transform = transforms.drawer;
        gesture.pane.style.transform = transforms.pane;
      });
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (gesture == null || gesture.phase === 'dead') {
        return;
      }
      if (event.touches.length !== 1) {
        if (gesture.phase === 'claimed') {
          settle(gesture, open);
        } else {
          clearDrag(gesture);
        }
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.startX;
      const dy = touch.clientY - gesture.startY;

      if (gesture.phase === 'tracking') {
        const horizontal = Math.abs(dx) >= ACTIVATION_DISTANCE;
        const wins = Math.abs(dx) >= Math.abs(dy) * AXIS_LOCK_RATIO;
        if (horizontal && wins) {
          const direction = dx > 0 ? 1 : -1;
          const wrongWay = gesture.opening ? direction !== 1 : direction !== -1;
          const blocker = wrongWay
            ? null
            : findHorizontalScrollBlocker(event.target as Element | null, surface, direction);
          if (wrongWay || blocker != null) {
            gesture.phase = 'dead';
            return;
          }
          gesture.phase = 'claimed';
          if (!gesture.reducedMotion) {
            gesture.drawer.style.transition = 'none';
            gesture.pane.style.transition = 'none';
            gesture.drawer.style.willChange = 'transform';
            gesture.pane.style.willChange = 'transform';
          }
        } else if (Math.abs(dy) >= ACTIVATION_DISTANCE) {
          gesture.phase = 'dead';
          return;
        } else {
          return;
        }
      }

      event.preventDefault();
      gesture.dx = dx;
      gesture.prevSample = gesture.lastSample;
      gesture.lastSample = { t: event.timeStamp, x: touch.clientX };
      scheduleDragFrame(gesture);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (gesture == null) {
        return;
      }
      /** A second finger lifting is not a release — settle only once the
       * surface is empty, or a lingering finger commits half a gesture. */
      if (event.touches.length > 0) {
        return;
      }
      if (gesture.phase !== 'claimed') {
        clearDrag(gesture);
        return;
      }
      const progress = gesture.opening ? gesture.dx : -gesture.dx;
      const elapsed = gesture.lastSample.t - gesture.prevSample.t;
      const velocity = elapsed > 0 ? (gesture.lastSample.x - gesture.prevSample.x) / elapsed : 0;
      const towardTarget = gesture.opening ? velocity : -velocity;
      const committed =
        progress >= gesture.width * COMMIT_DISTANCE_RATIO ||
        (towardTarget >= COMMIT_VELOCITY && progress >= FLICK_MIN_DISTANCE);
      settle(gesture, committed ? gesture.opening : open);
    };

    const onTouchCancel = () => {
      const gesture = gestureRef.current;
      if (gesture == null) {
        return;
      }
      if (gesture.phase === 'claimed') {
        settle(gesture, open);
      } else {
        clearDrag(gesture);
      }
    };

    surface.addEventListener('touchstart', onTouchStart, { passive: true });
    surface.addEventListener('touchmove', onTouchMove, { passive: false });
    surface.addEventListener('touchend', onTouchEnd, { passive: true });
    surface.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      surface.removeEventListener('touchcancel', onTouchCancel);
      const gesture = gestureRef.current;
      if (gesture != null) {
        /** An external open-change (keyboard toggle) mid-drag tears down these
         * listeners with the finger still down; the drag's inline transform
         * and `transition: none` must not outlive the gesture. */
        if (gesture.phase === 'claimed' && !gesture.reducedMotion) {
          releaseInlineStyles(drawer, pane);
        }
        clearDrag(gesture);
      }
    };
  }, [enabled, open, paneRef]);

  useEffect(
    () => () => {
      if (settleRef.current != null) {
        clearTimeout(settleRef.current.id);
      }
    },
    [],
  );
}
