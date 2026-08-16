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
      const { overflowX } = window.getComputedStyle(node);
      if (overflowX === 'auto' || overflowX === 'scroll') {
        const remaining =
          direction === 1 ? node.scrollLeft : node.scrollWidth - node.clientWidth - node.scrollLeft;
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
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      settleRef.current = setTimeout(() => {
        settleRef.current = null;
        drawerEl.style.transform = '';
        drawerEl.style.willChange = '';
        drawerEl.style.transition = SIDEBAR_TRANSITION;
        paneEl.style.transform = next ? 'translateX(100%)' : 'none';
        paneEl.style.willChange = '';
        paneEl.style.transition = SIDEBAR_TRANSITION;
      }, TRANSITION_MS + SETTLE_BUFFER_MS);
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

    const onTouchEnd = () => {
      const gesture = gestureRef.current;
      if (gesture == null) {
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
        clearDrag(gesture);
      }
    };
  }, [enabled, open, paneRef]);

  useEffect(
    () => () => {
      if (settleRef.current != null) {
        clearTimeout(settleRef.current);
      }
    },
    [],
  );
}
