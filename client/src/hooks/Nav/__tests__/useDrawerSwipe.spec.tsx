import { renderHook } from '@testing-library/react';
import useDrawerSwipe, { findHorizontalScrollBlocker } from '../useDrawerSwipe';
import { MOBILE_DRAWER_ID } from '~/components/UnifiedSidebar/constants';

const DRAWER_WIDTH = 375;

const createTouch = (x: number, y: number, identifier = 0) =>
  ({ clientX: x, clientY: y, identifier }) as Touch;

const touchEvent = (
  type: string,
  touches: Touch[],
  timeStamp: number,
  changedTouches?: Touch[],
): TouchEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'changedTouches', {
    value: changedTouches ?? [createTouch(0, 0, 0)],
  });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
};

type Harness = {
  pane: HTMLDivElement;
  drawer: HTMLDivElement;
  onOpenChange: jest.Mock;
  swipe: (
    surface: HTMLElement,
    points: Array<{ x: number; y: number; t: number; target?: Element }>,
    end?: boolean,
  ) => TouchEvent[];
  rerender: (props: { open: boolean; enabled: boolean }) => void;
  unmount: () => void;
};

const setup = (open: boolean, reducedMotion = false): Harness => {
  const pane = document.createElement('div');
  const drawer = document.createElement('div');
  drawer.id = MOBILE_DRAWER_ID;
  Object.defineProperty(drawer, 'clientWidth', { value: DRAWER_WIDTH, configurable: true });
  document.body.append(pane, drawer);

  jest.spyOn(window, 'matchMedia').mockReturnValue({
    matches: reducedMotion,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as MediaQueryList);
  jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

  const onOpenChange = jest.fn();
  const paneRef = { current: pane };
  const { unmount, rerender } = renderHook(
    (props: { open: boolean; enabled: boolean }) =>
      useDrawerSwipe({ paneRef, enabled: props.enabled, open: props.open, onOpenChange }),
    { initialProps: { open, enabled: true } },
  );

  const swipe: Harness['swipe'] = (surface, points, end = true) => {
    const events: TouchEvent[] = [];
    points.forEach(({ x, y, t, target }, index) => {
      const event = touchEvent(index === 0 ? 'touchstart' : 'touchmove', [createTouch(x, y)], t);
      (target ?? surface).dispatchEvent(event);
      events.push(event);
    });
    if (end) {
      const last = points[points.length - 1];
      surface.dispatchEvent(touchEvent('touchend', [], last.t + 16));
    }
    return events;
  };

  return {
    pane,
    drawer,
    onOpenChange,
    swipe,
    rerender,
    unmount: () => {
      unmount();
      pane.remove();
      drawer.remove();
    },
  };
};

afterEach(() => {
  document.getElementById(MOBILE_DRAWER_ID)?.remove();
});

describe('useDrawerSwipe — opening from the chat pane', () => {
  it('follows the finger and commits past the distance threshold', () => {
    const harness = setup(false);
    const events = harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 120, y: 104, t: 50 },
        { x: 220, y: 108, t: 100 },
      ],
      false,
    );

    expect(events[1].defaultPrevented).toBe(true);
    expect(harness.drawer.style.transform).toBe(`translate3d(${200 - DRAWER_WIDTH}px, 0, 0)`);
    expect(harness.pane.style.transform).toBe('translate3d(200px, 0, 0)');
    expect(harness.drawer.style.transition).toBe('none');

    harness.pane.dispatchEvent(touchEvent('touchend', [], 120));

    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    expect(harness.drawer.style.transform).toBe('translate3d(0, 0, 0)');
    expect(harness.pane.style.transform).toBe('translateX(100%)');
    harness.unmount();
  });

  it('reverts a slow swipe released under the threshold', () => {
    const harness = setup(false);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 60, y: 100, t: 200 },
      { x: 80, y: 100, t: 400 },
    ]);

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('translate3d(-100%, 0, 0)');
    expect(harness.pane.style.transform).toBe('translate3d(0, 0, 0)');
    harness.unmount();
  });

  it('commits a fast flick that never reaches the distance threshold', () => {
    const harness = setup(false);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 50, y: 100, t: 20 },
      { x: 80, y: 100, t: 40 },
    ]);

    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    harness.unmount();
  });

  it('cedes the touch to vertical scrolling once the axis locks that way', () => {
    const harness = setup(false);
    const events = harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 24, y: 140, t: 50 },
      { x: 90, y: 180, t: 100 },
    ]);

    expect(events[1].defaultPrevented).toBe(false);
    expect(events[2].defaultPrevented).toBe(false);
    expect(harness.drawer.style.transform).toBe('');
    expect(harness.onOpenChange).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('defers to a horizontal scroller that can still pan the same way', () => {
    const harness = setup(false);
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    Object.defineProperty(scroller, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: 300, configurable: true });
    scroller.scrollLeft = 120;
    harness.pane.append(scroller);

    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0, target: scroller },
      { x: 220, y: 100, t: 50, target: scroller },
      { x: 260, y: 100, t: 100, target: scroller },
    ]);

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('');
    harness.unmount();
  });

  it('claims the drag when that scroller is already parked at its edge', () => {
    const harness = setup(false);
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    Object.defineProperty(scroller, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: 300, configurable: true });
    scroller.scrollLeft = 0;
    harness.pane.append(scroller);

    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0, target: scroller },
      { x: 220, y: 100, t: 50, target: scroller },
    ]);

    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    harness.unmount();
  });

  it('never claims a drag that starts in a text surface', () => {
    const harness = setup(false);
    const textarea = document.createElement('textarea');
    harness.pane.append(textarea);

    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0, target: textarea },
      { x: 220, y: 100, t: 50, target: textarea },
    ]);

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('');
    harness.unmount();
  });

  it('snaps without tracking under prefers-reduced-motion', () => {
    const harness = setup(false, true);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 240, y: 100, t: 50 },
    ]);

    expect(harness.drawer.style.transform).toBe('');
    expect(harness.pane.style.transform).toBe('');
    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    /** The snap must suppress the shared 300ms transition for the flip. */
    expect(harness.drawer.style.transition).toBe('none');
    expect(harness.pane.style.transition).toBe('none');
    harness.unmount();
  });

  it('reverts cleanly when the browser cancels the touch', () => {
    const harness = setup(false);
    harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 220, y: 100, t: 50 },
      ],
      false,
    );
    harness.pane.dispatchEvent(touchEvent('touchcancel', [], 80));

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('translate3d(-100%, 0, 0)');
    harness.unmount();
  });
});

describe('useDrawerSwipe — closing from the drawer', () => {
  it('closes on a committed leftward swipe', () => {
    const harness = setup(true);
    harness.swipe(harness.drawer, [
      { x: 350, y: 100, t: 0 },
      { x: 250, y: 100, t: 50 },
      { x: 150, y: 100, t: 100 },
    ]);

    expect(harness.onOpenChange).toHaveBeenCalledWith(false);
    expect(harness.drawer.style.transform).toBe('translate3d(-100%, 0, 0)');
    expect(harness.pane.style.transform).toBe('translate3d(0, 0, 0)');
    harness.unmount();
  });

  it('ignores a rightward swipe while already open', () => {
    const harness = setup(true);
    harness.swipe(harness.drawer, [
      { x: 50, y: 100, t: 0 },
      { x: 250, y: 100, t: 50 },
    ]);

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    harness.unmount();
  });
});

describe('useDrawerSwipe — interruptions and re-arming', () => {
  it('cancels a stale settle when a button closes the drawer inside its window', () => {
    jest.useFakeTimers();
    const harness = setup(false);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 220, y: 100, t: 50 },
    ]);
    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    expect(harness.pane.style.transform).toBe('translateX(100%)');

    harness.rerender({ open: true, enabled: true });
    harness.rerender({ open: false, enabled: true });
    expect(harness.pane.style.transform).toBe('');
    expect(harness.drawer.style.transform).toBe('');

    jest.runAllTimers();
    expect(harness.pane.style.transform).toBe('');
    jest.useRealTimers();
    harness.unmount();
  });

  it('keeps a settle that agrees with the state change it caused', () => {
    jest.useFakeTimers();
    const harness = setup(false);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 220, y: 100, t: 50 },
    ]);

    harness.rerender({ open: true, enabled: true });
    expect(harness.drawer.style.transform).toBe('translate3d(0, 0, 0)');

    jest.runAllTimers();
    expect(harness.pane.style.transform).toBe('translateX(100%)');
    expect(harness.drawer.style.transform).toBe('');
    jest.useRealTimers();
    harness.unmount();
  });

  it('ignores a second finger lifting mid-drag and settles only on full release', () => {
    const harness = setup(false);
    harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 220, y: 100, t: 50 },
      ],
      false,
    );

    harness.pane.dispatchEvent(
      touchEvent('touchend', [createTouch(220, 100, 0)], 80, [createTouch(80, 200, 1)]),
    );
    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.pane.style.transform).toBe('translate3d(200px, 0, 0)');

    harness.pane.dispatchEvent(touchEvent('touchend', [], 100));
    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    harness.unmount();
  });

  it('releases drag styles when an external toggle interrupts a held drag', () => {
    const harness = setup(false);
    harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 220, y: 100, t: 50 },
      ],
      false,
    );
    expect(harness.drawer.style.transition).toBe('none');

    harness.rerender({ open: true, enabled: true });
    expect(harness.drawer.style.transform).toBe('');
    expect(harness.drawer.style.transition).not.toBe('none');
    /** React committed the open pane transform before this cleanup and will
     * not re-assert it — the release must restore it, not clear it. */
    expect(harness.pane.style.transform).toBe('translateX(100%)');
    harness.unmount();
  });

  it('cancels a stale settle when crossing the breakpoint disables the hook', () => {
    jest.useFakeTimers();
    const harness = setup(false);
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 220, y: 100, t: 50 },
    ]);
    harness.rerender({ open: true, enabled: true });
    harness.rerender({ open: true, enabled: false });

    expect(harness.pane.style.transform).toBe('');
    jest.runAllTimers();
    expect(harness.pane.style.transform).toBe('');
    jest.useRealTimers();
    harness.unmount();
  });

  it('reverts when the initiating finger lifts while a second remains', () => {
    const harness = setup(false);
    harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 220, y: 100, t: 50 },
      ],
      false,
    );

    harness.pane.dispatchEvent(
      touchEvent('touchend', [createTouch(80, 200, 1)], 80, [createTouch(220, 100, 0)]),
    );

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('translate3d(-100%, 0, 0)');
    harness.unmount();
  });

  it('expires flick momentum when the finger holds still before lifting', () => {
    const harness = setup(false);
    harness.swipe(
      harness.pane,
      [
        { x: 20, y: 100, t: 0 },
        { x: 50, y: 100, t: 20 },
        { x: 80, y: 100, t: 40 },
      ],
      false,
    );
    harness.pane.dispatchEvent(touchEvent('touchend', [], 600));

    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(harness.drawer.style.transform).toBe('translate3d(-100%, 0, 0)');
    harness.unmount();
  });

  it('arms itself when enabled flips true after the surfaces exist', () => {
    const harness = setup(false);
    harness.rerender({ open: false, enabled: false });
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 0 },
      { x: 220, y: 100, t: 50 },
    ]);
    expect(harness.onOpenChange).not.toHaveBeenCalled();

    harness.rerender({ open: false, enabled: true });
    harness.swipe(harness.pane, [
      { x: 20, y: 100, t: 200 },
      { x: 220, y: 100, t: 250 },
    ]);
    expect(harness.onOpenChange).toHaveBeenCalledWith(true);
    harness.unmount();
  });
});

describe('findHorizontalScrollBlocker', () => {
  const scroller = (scrollLeft: number) => {
    const el = document.createElement('div');
    el.style.overflowX = 'auto';
    Object.defineProperty(el, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true });
    el.scrollLeft = scrollLeft;
    return el;
  };

  it('is direction-aware at either edge', () => {
    const boundary = document.createElement('div');
    const atStart = scroller(0);
    const child = document.createElement('span');
    atStart.append(child);
    boundary.append(atStart);

    expect(findHorizontalScrollBlocker(child, boundary, 1)).toBeNull();
    expect(findHorizontalScrollBlocker(child, boundary, -1)).toBe(atStart);

    const atEnd = scroller(300);
    const endChild = document.createElement('span');
    atEnd.append(endChild);
    boundary.append(atEnd);

    expect(findHorizontalScrollBlocker(endChild, boundary, 1)).toBe(atEnd);
    expect(findHorizontalScrollBlocker(endChild, boundary, -1)).toBeNull();
  });

  it('normalizes RTL scroll offsets before deciding', () => {
    const boundary = document.createElement('div');
    const rtl = scroller(0);
    rtl.style.direction = 'rtl';
    const child = document.createElement('span');
    rtl.append(child);
    boundary.append(rtl);

    expect(findHorizontalScrollBlocker(child, boundary, 1)).toBe(rtl);
    expect(findHorizontalScrollBlocker(child, boundary, -1)).toBeNull();

    rtl.scrollLeft = -300;
    expect(findHorizontalScrollBlocker(child, boundary, 1)).toBeNull();
    expect(findHorizontalScrollBlocker(child, boundary, -1)).toBe(rtl);
  });

  it('stops searching at the boundary element', () => {
    const outer = scroller(120);
    const boundary = document.createElement('div');
    const child = document.createElement('span');
    boundary.append(child);
    outer.append(boundary);

    expect(findHorizontalScrollBlocker(child, boundary, 1)).toBeNull();
  });
});
