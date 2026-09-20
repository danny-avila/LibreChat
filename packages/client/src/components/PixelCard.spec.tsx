import { act, fireEvent, render } from '@testing-library/react';
import PixelCard from './PixelCard';

const frameCallbacks = new Map<number, FrameRequestCallback>();
const observers: WatchingIntersectionObserver[] = [];
const originalMatchMedia = window.matchMedia;
const originalObserver = window.IntersectionObserver;
let frameId = 0;
let now = 0;
let hidden = false;
const context: Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle'> = {
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  fillStyle: '',
};

class WatchingIntersectionObserver implements IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [0];
  target?: Element;
  disconnect = jest.fn();
  unobserve = jest.fn();
  takeRecords = () => [];

  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  visible(isIntersecting: boolean) {
    if (!this.target) throw new Error('Expected an observed card');
    const bounds = this.target.getBoundingClientRect();
    this.callback(
      [
        {
          target: this.target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          time: now,
          boundingClientRect: bounds,
          intersectionRect: bounds,
          rootBounds: bounds,
        },
      ],
      this,
    );
  }
}

function motion(matches: boolean) {
  const query = Object.assign(new EventTarget(), {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
  });
  window.matchMedia = jest.fn(() => query);
  return (next: boolean) => {
    query.matches = next;
    act(() => query.dispatchEvent(new Event('change')));
  };
}

function tick() {
  now += 20;
  const scheduled = [...frameCallbacks];
  frameCallbacks.clear();
  act(() => scheduled.forEach(([, callback]) => callback(now)));
}

beforeEach(() => {
  frameCallbacks.clear();
  observers.length = 0;
  frameId = 0;
  now = 0;
  hidden = false;
  jest.mocked(context.clearRect).mockClear();
  jest.mocked(context.fillRect).mockClear();
  window.IntersectionObserver = WatchingIntersectionObserver;
  motion(false);
  jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as CanvasRenderingContext2D);
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    top: 0,
    left: 0,
    right: 20,
    bottom: 20,
    toJSON: () => ({}),
  });
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallbacks.set(++frameId, callback);
    return frameId;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frameCallbacks.delete(id);
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  window.IntersectionObserver = originalObserver;
});

test('renders a stable decorative frame without animation when reduced motion is enabled', () => {
  motion(true);
  const view = render(<PixelCard noFocus progress={0.1} width="20px" height="20px" />);
  expect(context.fillRect).toHaveBeenCalled();
  expect(frameCallbacks.size).toBe(0);
  const pixels = [
    ...new Set(jest.mocked(context.fillRect).mock.calls.map((call) => JSON.stringify(call))),
  ];
  jest.mocked(context.fillRect).mockClear();
  view.rerender(<PixelCard noFocus progress={0.8} width="20px" height="20px" />);
  expect([
    ...new Set(jest.mocked(context.fillRect).mock.calls.map((call) => JSON.stringify(call))),
  ]).toEqual(pixels);
  expect(frameCallbacks.size).toBe(0);
  view.unmount();
});

test('responds to reduced motion changes and releases every scheduled frame on unmount', () => {
  const changeMotion = motion(false);
  const view = render(<PixelCard progress={0.5} />);
  const originalObserver = observers[observers.length - 1]!;
  expect(frameCallbacks.size).toBe(1);
  changeMotion(true);
  act(() => originalObserver.visible(true));
  expect(frameCallbacks.size).toBe(0);
  expect(context.fillRect).toHaveBeenCalled();
  changeMotion(false);
  act(() => originalObserver.visible(false));
  expect(frameCallbacks.size).toBe(1);
  view.unmount();
  expect(frameCallbacks.size).toBe(0);
  expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
  act(() => observers.forEach((observer) => observer.visible(true)));
  tick();
  expect(frameCallbacks.size).toBe(0);
});

test('pauses hidden cards and resumes with the latest progress when visible again', () => {
  const view = render(<PixelCard progress={0.2} />);
  const observer = observers[observers.length - 1]!;
  act(() => observer.visible(false));
  expect(frameCallbacks.size).toBe(0);
  view.rerender(<PixelCard progress={0.8} />);
  expect(frameCallbacks.size).toBe(0);
  act(() => observer.visible(true));
  expect(frameCallbacks.size).toBe(1);
  tick();
  tick();
  expect(context.fillRect).toHaveBeenCalled();
  view.unmount();
});

test('pauses background tabs and resumes without retaining listeners after unmount', () => {
  const view = render(<PixelCard progress={0.4} />);
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  expect(frameCallbacks.size).toBe(0);
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  expect(frameCallbacks.size).toBe(1);
  view.unmount();
  fireEvent(document, new Event('visibilitychange'));
  expect(frameCallbacks.size).toBe(0);
});

test('preserves hover behavior for cards without progress and avoids decorative tab stops', () => {
  const view = render(<PixelCard noFocus />);
  expect(frameCallbacks.size).toBe(0);
  const card = view.container.querySelector('[tabindex]')!;
  expect(card).toHaveAttribute('tabindex', '-1');
  fireEvent.mouseEnter(card);
  expect(frameCallbacks.size).toBe(1);
  fireEvent.mouseLeave(card);
  tick();
  expect(frameCallbacks.size).toBe(0);
  view.unmount();
});
