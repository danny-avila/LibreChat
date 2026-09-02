import React from 'react';
import { act, renderHook } from '@testing-library/react';
import type { RowMountWindow } from '../useProgressiveRowMount';
import { useProgressiveRowMount, completeProgressiveRowMounts } from '../useProgressiveRowMount';

type HookProps = {
  tailDepth: number | undefined;
  anchorBottom: boolean;
  isSubmitting: boolean;
  conversationId: string | null | undefined;
};

describe('useProgressiveRowMount', () => {
  let frames: Array<FrameRequestCallback | undefined>;
  let scrollableRef: React.MutableRefObject<HTMLDivElement | null>;
  let resizeCallback: ResizeObserverCallback;

  /** Runs only the frames scheduled BEFORE this flush, so one call advances
   *  the expansion by exactly one step even though each step schedules the
   *  next frame during the act() flush. */
  const flushFrames = () =>
    act(() => {
      const pending = frames.length;
      for (let index = 0; index < pending; index += 1) {
        const frame = frames[index];
        frames[index] = undefined;
        frame?.(index);
      }
    });

  beforeEach(() => {
    frames = [];
    scrollableRef = { current: null };
    window.ResizeObserver = jest.fn((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    }) as unknown as typeof ResizeObserver;
    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn((handle: number) => {
      frames[handle - 1] = undefined;
    }) as unknown as typeof window.cancelAnimationFrame;
  });

  const setup = (initial: Partial<HookProps> = {}) => {
    const props: HookProps = {
      tailDepth: 267,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
      ...initial,
    };
    return renderHook(
      (current: HookProps) => useProgressiveRowMount({ ...current, scrollableRef }),
      { initialProps: props },
    );
  };

  it('does not window short threads', () => {
    const { result } = setup({ tailDepth: 20 });
    expect(result.current).toBeNull();
  });

  it('does not window when a submission is already active', () => {
    const { result } = setup({ isSubmitting: true, anchorBottom: true });
    expect(result.current).toEqual({
      mode: 'progressive',
      start: 252,
      end: Number.POSITIVE_INFINITY,
    });
  });

  it('anchors the first window at the top by default', () => {
    const { result } = setup();
    expect(result.current).toEqual({ mode: 'progressive', start: 0, end: 15 });
  });

  it('anchors the first window at the tail for bottom anchoring', () => {
    const { result } = setup({ anchorBottom: true });
    expect(result.current).toEqual({
      mode: 'progressive',
      start: 252,
      end: Number.POSITIVE_INFINITY,
    });
  });

  it('widens per frame until the whole path is covered, then lifts the restriction', () => {
    const { result } = setup();
    const seen: RowMountWindow[] = [result.current];

    for (let i = 0; i < 20 && result.current != null; i += 1) {
      flushFrames();
      seen.push(result.current);
    }

    expect(result.current).toBeNull();
    const ends = seen.filter((w): w is NonNullable<RowMountWindow> => w != null).map((w) => w.end);
    for (let i = 1; i < ends.length; i += 1) {
      expect(ends[i]).toBeGreaterThan(ends[i - 1]);
    }
    /** The final widening and the covered-check that lifts the restriction
     *  land in the same flush, so the last observable window sits within one
     *  chunk of the tail. */
    expect(ends[ends.length - 1]).toBeGreaterThanOrEqual(267 - 32);
  });

  it('settles into a bounded window with exact-height slots and follows scrolling', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600 }),
    });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    for (let depth = 0; depth <= 267; depth += 1) {
      const slot = document.createElement('div');
      slot.dataset.messageRowSlot = 'true';
      slot.dataset.rowMounted = 'true';
      slot.dataset.rowDepth = String(depth);
      slot.dataset.rowMessageId = `message-${depth}`;
      Object.defineProperty(slot, 'getBoundingClientRect', {
        value: () => {
          const top = depth * 100 - container.scrollTop;
          return { top, bottom: top + 100, left: 0, right: 390, width: 390, height: 100 };
        },
      });
      container.appendChild(slot);
    }
    scrollableRef.current = container;
    const querySpy = jest.spyOn(container, 'querySelectorAll');

    const { result } = setup();
    for (let i = 0; i < 20 && result.current?.mode === 'progressive'; i += 1) {
      flushFrames();
    }

    expect(result.current?.mode).toBe('bounded');
    expect(result.current?.start).toBe(0);
    expect(result.current?.end).toBe(14);
    expect(result.current?.heights?.size).toBe(268);
    const queriesAfterMeasurement = querySpy.mock.calls.length;

    act(() => {
      resizeCallback(
        [{ contentRect: { width: 390 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(result.current?.mode).toBe('bounded');

    act(() => {
      container.scrollTop = 10_000;
      container.dispatchEvent(new Event('scroll'));
    });
    flushFrames();

    expect(result.current?.start).toBe(91);
    expect(result.current?.end).toBe(114);
    expect(querySpy).toHaveBeenCalledTimes(queriesAfterMeasurement);

    act(() => {
      resizeCallback(
        [{ contentRect: { width: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(result.current?.mode).toBe('progressive');
  });

  it('keeps progressive mounting bounded when a submission starts mid-expansion', () => {
    const { result, rerender } = setup();
    expect(result.current).not.toBeNull();

    rerender({
      tailDepth: 267,
      anchorBottom: true,
      isSubmitting: true,
      conversationId: 'convo-a',
    });
    flushFrames();
    expect(result.current?.mode).toBe('progressive');
    expect(result.current?.tailStart).toBe(264);
  });

  it('force-completes in-flight mounts for DOM consumers, resolving after paint', async () => {
    const { result } = setup();
    expect(result.current).not.toBeNull();

    let resolved = false;
    let completion: Promise<() => void> = Promise.resolve(() => {});
    let overlappingCompletion: Promise<() => void> = Promise.resolve(() => {});
    act(() => {
      completion = completeProgressiveRowMounts().then((releaseMounts) => {
        resolved = true;
        return releaseMounts;
      });
      overlappingCompletion = completeProgressiveRowMounts();
    });
    expect(result.current).toBeNull();

    flushFrames();
    flushFrames();
    let release = () => {};
    let releaseOverlapping = () => {};
    await act(async () => {
      release = await completion;
      releaseOverlapping = await overlappingCompletion;
    });
    expect(resolved).toBe(true);
    act(() => release());
    expect(result.current).toBeNull();
    act(() => releaseOverlapping());
  });

  it('re-arms a fresh window when the conversation changes', () => {
    const { result, rerender } = setup();

    while (result.current != null) {
      flushFrames();
    }
    expect(result.current).toBeNull();

    rerender({
      tailDepth: 199,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-b',
    });
    expect(result.current).toEqual({ mode: 'progressive', start: 0, end: 15 });
  });
});
