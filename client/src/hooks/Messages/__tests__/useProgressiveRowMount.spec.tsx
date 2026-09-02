import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import type { RowMountWindow } from '../useProgressiveRowMount';
import {
  RowMountProvider,
  useRowMountWindow,
  useProgressiveRowMount,
  completeProgressiveRowMounts,
  withAllRowsMountedImmediately,
} from '../useProgressiveRowMount';

type HookProps = {
  tailDepth: number | undefined;
  anchorBottom: boolean;
  isSubmitting: boolean;
  conversationId: string | null | undefined;
  layoutKey?: unknown;
};

describe('useProgressiveRowMount', () => {
  let frames: Array<FrameRequestCallback | undefined>;
  let scrollableRef: React.MutableRefObject<HTMLDivElement | null>;
  let resizeCallback: ResizeObserverCallback;
  let mutationCallback: MutationCallback;
  let originalFonts: FontFaceSet | undefined;

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
    originalFonts = document.fonts;
    frames = [];
    scrollableRef = { current: null };
    window.ResizeObserver = jest.fn((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
    }) as unknown as typeof ResizeObserver;
    window.MutationObserver = jest.fn((callback: MutationCallback) => {
      mutationCallback = callback;
      return { observe: jest.fn(), disconnect: jest.fn(), takeRecords: jest.fn() };
    }) as unknown as typeof MutationObserver;
    window.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = jest.fn((handle: number) => {
      frames[handle - 1] = undefined;
    }) as unknown as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts });
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

  it('settles asynchronous rows, follows scrolling, and preserves full-DOM leases', async () => {
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
      if (depth === 267) {
        const pendingImage = document.createElement('img');
        pendingImage.src = 'https://example.test/pending.png';
        slot.appendChild(pendingImage);
      }
      if (depth === 266) {
        const pendingLayout = document.createElement('div');
        pendingLayout.dataset.rowLayoutPending = 'true';
        slot.appendChild(pendingLayout);
      }
      container.appendChild(slot);
    }
    scrollableRef.current = container;
    const querySpy = jest.spyOn(container, 'querySelectorAll');

    const { result, rerender } = setup();
    for (let i = 0; i < 20 && result.current?.mode === 'progressive'; i += 1) {
      flushFrames();
    }

    expect(result.current?.mode).toBe('progressive');
    const pendingImage = container.querySelector('img');
    if (pendingImage) Object.defineProperty(pendingImage, 'complete', { value: true });
    act(() => pendingImage?.dispatchEvent(new Event('load')));
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('progressive');
    act(() => {
      const pendingLayout = container.querySelector('[data-row-layout-pending="true"]');
      pendingLayout?.remove();
      mutationCallback(
        [
          {
            type: 'childList',
            addedNodes: [] as unknown as NodeList,
            removedNodes: [pendingLayout] as unknown as NodeList,
          } as MutationRecord,
        ],
        {} as MutationObserver,
      );
    });
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('bounded');
    expect(result.current?.start).toBe(0);
    expect(result.current?.end).toBe(14);
    expect(result.current?.heights?.size).toBe(268);
    const publishedHeights = result.current?.heights;
    act(() => {
      container.scrollTop = 1;
      container.dispatchEvent(new Event('scroll'));
    });
    flushFrames();
    expect(result.current?.heights).toBe(publishedHeights);

    act(() => result.current?.measureRow?.(3, 'message-3', 175));
    expect(result.current?.heights?.get(3)?.height).toBe(100);
    act(() => result.current?.pinRow?.(0, 'message-0'));
    expect(result.current?.heights?.get(3)?.height).toBe(175);

    act(() => {
      for (let depth = 0; depth < 9; depth += 1) {
        result.current?.pinRow?.(depth, `message-${depth}`);
      }
    });
    expect(result.current?.pinnedRows?.size).toBe(8);
    expect(result.current?.pinnedRows?.has(0)).toBe(false);
    act(() => {
      result.current?.pinRow?.(1, 'replacement-at-depth-1');
      result.current?.pinRow?.(9, 'message-9');
    });
    expect(result.current?.pinnedRows?.get(1)).toBe('replacement-at-depth-1');
    expect(result.current?.pinnedRows?.has(2)).toBe(false);
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
    expect(result.current?.end).toBe(113);
    expect(querySpy).toHaveBeenCalledTimes(queriesAfterMeasurement);

    act(() => {
      resizeCallback(
        [{ contentRect: { width: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(result.current).toEqual({
      mode: 'progressive',
      start: 0,
      end: Number.POSITIVE_INFINITY,
    });
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('bounded');

    act(() => {
      resizeCallback(
        [{ contentRect: { width: 600 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    const screenshotPendingLayout = document.createElement('div');
    screenshotPendingLayout.dataset.rowLayoutPending = 'true';
    container.appendChild(screenshotPendingLayout);
    let releaseLease = () => {};
    let lease: Promise<() => void> = Promise.resolve(() => {});
    let leaseResolved = false;
    act(() => {
      lease = completeProgressiveRowMounts().then((release) => {
        leaseResolved = true;
        return release;
      });
    });
    flushFrames();
    flushFrames();
    expect(leaseResolved).toBe(false);
    act(() => screenshotPendingLayout.remove());
    flushFrames();
    flushFrames();
    await act(async () => {
      releaseLease = await lease;
    });
    expect(leaseResolved).toBe(true);
    expect(result.current).toBeNull();
    const leasePendingLayout = document.createElement('div');
    leasePendingLayout.dataset.rowLayoutPending = 'true';
    container.appendChild(leasePendingLayout);
    act(() => releaseLease());
    expect(result.current?.mode).toBe('progressive');
    act(() => {
      leasePendingLayout.remove();
      mutationCallback(
        [
          {
            type: 'childList',
            addedNodes: [] as unknown as NodeList,
            removedNodes: [leasePendingLayout] as unknown as NodeList,
          } as MutationRecord,
        ],
        {} as MutationObserver,
      );
    });
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('bounded');

    rerender({
      tailDepth: 267,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
      layoutKey: 'maximized',
    });
    expect(result.current).toEqual({
      mode: 'progressive',
      start: 0,
      end: Number.POSITIVE_INFINITY,
    });
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('bounded');

    rerender({
      tailDepth: 20,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
      layoutKey: 'maximized',
    });
    flushFrames();
    expect(result.current).toBeNull();
    rerender({
      tailDepth: 267,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
      layoutKey: 'maximized',
    });
    flushFrames();
    expect(result.current?.mode).toBe('progressive');
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('bounded');
    expect(result.current?.tailStart).toBe(266);
  });

  it('starts bounding a mounted conversation when it crosses the row threshold', async () => {
    let resolveFonts = () => {};
    const fontSet = {
      status: 'loading',
      ready: new Promise<void>((resolve) => {
        resolveFonts = resolve;
      }),
    };
    Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet });
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600 }),
    });
    for (let depth = 0; depth <= 40; depth += 1) {
      const slot = document.createElement('div');
      slot.dataset.messageRowSlot = 'true';
      slot.dataset.rowMounted = 'true';
      slot.dataset.rowDepth = String(depth);
      slot.dataset.rowMessageId = `message-${depth}`;
      Object.defineProperty(slot, 'getBoundingClientRect', {
        value: () => ({
          top: depth * 100,
          bottom: depth * 100 + 100,
          left: 0,
          right: 390,
          width: 390,
          height: 100,
        }),
      });
      container.appendChild(slot);
    }
    const pendingLayout = document.createElement('div');
    pendingLayout.dataset.rowLayoutPending = 'true';
    container.appendChild(pendingLayout);
    scrollableRef.current = container;
    const { result, rerender } = setup({ tailDepth: 39 });
    expect(result.current).toBeNull();

    rerender({
      tailDepth: 40,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
    });
    flushFrames();

    expect(result.current?.mode).toBe('progressive');
    flushFrames();
    flushFrames();
    expect(result.current?.mode).toBe('progressive');
    act(() => {
      pendingLayout.remove();
      mutationCallback(
        [
          {
            type: 'childList',
            addedNodes: [] as unknown as NodeList,
            removedNodes: [pendingLayout] as unknown as NodeList,
          } as MutationRecord,
        ],
        {} as MutationObserver,
      );
    });
    flushFrames();
    flushFrames();

    expect(result.current?.mode).toBe('progressive');
    await act(async () => {
      fontSet.status = 'loaded';
      resolveFonts();
      await Promise.resolve();
    });
    flushFrames();
    flushFrames();

    expect(result.current?.mode).toBe('bounded');
    expect(result.current?.heights?.size).toBe(41);
  });

  it('notifies only rows whose mount snapshot changes', () => {
    const renderCounts = [0, 0, 0];
    const Probe = React.memo(({ depth }: { depth: number }) => {
      renderCounts[depth] += 1;
      const state = useRowMountWindow(depth, `message-${depth}`);
      return <span data-depth={depth}>{String(state.windowMounted)}</span>;
    });
    const probes = (
      <>
        <Probe depth={0} />
        <Probe depth={1} />
        <Probe depth={2} />
      </>
    );
    const heights = new Map<number, { messageId: string; height: number }>(
      [0, 1, 2].map((depth) => [depth, { messageId: `message-${depth}`, height: 100 }]),
    );
    const firstWindow: NonNullable<RowMountWindow> = {
      mode: 'bounded',
      start: 0,
      end: 0,
      heights,
    };
    const heightLookup = jest.spyOn(heights, 'get');
    const view = render(<RowMountProvider mountWindow={firstWindow}>{probes}</RowMountProvider>);
    expect(renderCounts).toEqual([1, 1, 1]);
    heightLookup.mockClear();

    view.rerender(
      <RowMountProvider mountWindow={{ ...firstWindow, start: 1, end: 1 }}>
        {probes}
      </RowMountProvider>,
    );

    expect(renderCounts).toEqual([2, 2, 1]);
    expect(heightLookup).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the scroll index when the active message path shrinks', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600 }),
    });
    for (let depth = 0; depth <= 60; depth += 1) {
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
    const { result, rerender } = setup({ tailDepth: 60 });
    while (result.current?.mode === 'progressive') flushFrames();
    expect(result.current?.mode).toBe('bounded');

    rerender({
      tailDepth: 50,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-a',
    });
    act(() => {
      container.scrollTop = 2_500;
      container.dispatchEvent(new Event('scroll'));
    });
    flushFrames();

    expect(result.current?.start).toBe(16);
    expect(result.current?.end).toBe(39);
    expect(result.current?.heights?.size).toBe(51);
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

  it('mounts every row synchronously for keyboard actions and releases afterward', async () => {
    const { result } = setup();
    expect(result.current).not.toBeNull();

    let observedWindow: RowMountWindow = result.current;
    act(() => {
      withAllRowsMountedImmediately(() => {
        observedWindow = result.current;
      });
    });

    expect(observedWindow).toBeNull();
    await act(async () => Promise.resolve());
  });

  it('re-arms a fresh window when the conversation changes', () => {
    const { result, rerender } = setup({ layoutKey: 'layout-a' });

    while (result.current != null) {
      flushFrames();
    }
    expect(result.current).toBeNull();

    rerender({
      tailDepth: 199,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-b',
      layoutKey: 'layout-b',
    });
    expect(result.current).toEqual({ mode: 'progressive', start: 0, end: 15 });
  });

  it('ignores stale resize measurement frames after changing conversations', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600 }),
    });
    for (let depth = 0; depth <= 40; depth += 1) {
      const slot = document.createElement('div');
      slot.dataset.messageRowSlot = 'true';
      slot.dataset.rowMounted = 'true';
      slot.dataset.rowDepth = String(depth);
      slot.dataset.rowMessageId = `message-${depth}`;
      Object.defineProperty(slot, 'getBoundingClientRect', {
        value: () => ({
          top: depth * 100,
          bottom: depth * 100 + 100,
          left: 0,
          right: 390,
          width: 390,
          height: 100,
        }),
      });
      container.appendChild(slot);
    }
    scrollableRef.current = container;
    const { result, rerender } = setup({ tailDepth: 40 });
    while (result.current?.mode === 'progressive') flushFrames();
    act(() => {
      resizeCallback(
        [{ contentRect: { width: 390 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      resizeCallback(
        [{ contentRect: { width: 500 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    expect(result.current).toEqual({
      mode: 'progressive',
      start: 0,
      end: Number.POSITIVE_INFINITY,
    });

    rerender({
      tailDepth: 40,
      anchorBottom: false,
      isSubmitting: false,
      conversationId: 'convo-b',
    });
    flushFrames();
    flushFrames();

    expect(result.current?.mode).toBe('progressive');
  });
});
