import { act, render, screen } from '@testing-library/react';
import ControlCombobox from './ControlCombobox';

type CapturedObserver = {
  callback: ResizeObserverCallback;
  target: Element | null;
  disconnect: jest.Mock;
};

const observers: CapturedObserver[] = [];

class CapturingResizeObserver {
  callback: ResizeObserverCallback;
  target: Element | null = null;
  disconnect = jest.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  unobserve = jest.fn();
}

const originalResizeObserver = window.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  (window as unknown as { ResizeObserver: typeof CapturingResizeObserver }).ResizeObserver =
    CapturingResizeObserver;
});

afterEach(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
});

const items = [
  { label: 'Option A', value: 'a' },
  { label: 'Option B', value: 'b' },
];

const renderCombobox = (initialButtonWidth: number) => {
  const offsetWidthSpy = jest
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockReturnValue(initialButtonWidth);

  const utils = render(
    <ControlCombobox
      selectedValue="a"
      displayValue="Option A"
      items={items}
      setValue={() => undefined}
      ariaLabel="Test combobox"
      isCollapsed={false}
      showCarat
    />,
  );

  return { ...utils, offsetWidthSpy };
};

const getPopoverWidth = () => {
  const popover = document.querySelector('.animate-popover') as HTMLElement | null;
  return popover?.style.width ?? null;
};

const openPopover = () => {
  const trigger = screen.getByRole('combobox');
  act(() => {
    trigger.click();
  });
};

describe('ControlCombobox popover sizing', () => {
  it('uses the button width measured on mount when layout is stable', () => {
    renderCombobox(275);
    openPopover();
    expect(getPopoverWidth()).toBe('275px');
  });

  it('updates the popover width when the trigger resizes after mount (regression: agent select dropdown rendering at narrow width)', () => {
    const { offsetWidthSpy } = renderCombobox(26);
    openPopover();
    expect(getPopoverWidth()).toBe('26px');

    const observer = observers[0];
    expect(observer).toBeDefined();
    expect(observer.target).not.toBeNull();

    offsetWidthSpy.mockReturnValue(275);

    act(() => {
      observer.callback(
        [
          {
            target: observer.target as Element,
            contentRect: { width: 275 } as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: 275, blockSize: 36 }],
            contentBoxSize: [{ inlineSize: 275, blockSize: 36 }],
            devicePixelContentBoxSize: [{ inlineSize: 275, blockSize: 36 }],
          } as unknown as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      );
    });

    expect(getPopoverWidth()).toBe('275px');
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const { unmount } = renderCombobox(275);
    openPopover();
    const observer = observers[0];
    expect(observer).toBeDefined();
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
