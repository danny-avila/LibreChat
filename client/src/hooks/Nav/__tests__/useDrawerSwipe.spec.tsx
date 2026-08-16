import { renderHook } from '@testing-library/react';
import useDrawerSwipe, { findHorizontalScrollBlocker } from '../useDrawerSwipe';
import { MOBILE_DRAWER_ID } from '~/components/UnifiedSidebar/constants';

const DRAWER_WIDTH = 375;

const createTouch = (x: number, y: number) => ({ clientX: x, clientY: y }) as Touch;

const touchEvent = (type: string, touches: Touch[], timeStamp: number): TouchEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: touches });
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
  const { unmount } = renderHook(() =>
    useDrawerSwipe({ paneRef: { current: pane }, enabled: true, open, onOpenChange }),
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

  it('stops searching at the boundary element', () => {
    const outer = scroller(120);
    const boundary = document.createElement('div');
    const child = document.createElement('span');
    boundary.append(child);
    outer.append(boundary);

    expect(findHorizontalScrollBlocker(child, boundary, 1)).toBeNull();
  });
});
