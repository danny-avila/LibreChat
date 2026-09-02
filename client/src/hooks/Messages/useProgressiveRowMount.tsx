import {
  useRef,
  useState,
  useEffect,
  useContext,
  useCallback,
  createContext,
  useLayoutEffect,
  startTransition,
} from 'react';
import type { ReactNode, RefObject } from 'react';

type MeasuredRow = { messageId: string; height: number };

export type RowMountWindow = {
  mode: 'progressive' | 'bounded';
  start: number;
  end: number;
  tailStart?: number;
  heights?: ReadonlyMap<number, MeasuredRow>;
  measureRow?: (depth: number, messageId: string, height: number) => void;
} | null;

const RowMountContext = createContext<RowMountWindow>(null);

export function RowMountProvider({
  mountWindow,
  children,
}: {
  mountWindow: RowMountWindow;
  children: ReactNode;
}) {
  return <RowMountContext.Provider value={mountWindow}>{children}</RowMountContext.Provider>;
}

export function useRowMountWindow(): RowMountWindow {
  return useContext(RowMountContext);
}

const MIN_WINDOWED_ROWS = 40;
const INITIAL_ROWS = 16;
const CHUNK_ROWS = 32;
const WINDOW_OVERSCAN_ROWS = 8;
const STREAM_TAIL_ROWS = 4;
const MOUNTED_ROW_SLOT_SELECTOR = '[data-message-row-slot="true"][data-row-mounted="true"]';

type ProgressiveRowMountOptions = {
  tailDepth: number | undefined;
  anchorBottom: boolean;
  isSubmitting: boolean;
  conversationId: string | null | undefined;
  scrollableRef: RefObject<HTMLDivElement | null>;
  layoutKey?: unknown;
};

function progressiveWindow(tailDepth: number | undefined, anchorBottom: boolean): RowMountWindow {
  if (tailDepth == null || tailDepth + 1 <= MIN_WINDOWED_ROWS) {
    return null;
  }
  if (anchorBottom) {
    return {
      mode: 'progressive',
      start: Math.max(0, tailDepth - INITIAL_ROWS + 1),
      end: Number.POSITIVE_INFINITY,
    };
  }
  return { mode: 'progressive', start: 0, end: INITIAL_ROWS - 1 };
}

function rowMetadata(element: Element): { depth: number; messageId: string } | null {
  const depth = Number(element.getAttribute('data-row-depth'));
  const messageId = element.getAttribute('data-row-message-id');
  if (!Number.isFinite(depth) || messageId == null) {
    return null;
  }
  return { depth, messageId };
}

/**
 * Keeps long message paths bounded after their progressive first measurement.
 * Every off-window row becomes one exact-height slot, preserving scroll
 * geometry and message IDs for navigation while releasing its rich subtree.
 */
export function useProgressiveRowMount({
  tailDepth,
  anchorBottom,
  isSubmitting,
  conversationId,
  scrollableRef,
  layoutKey,
}: ProgressiveRowMountOptions): RowMountWindow {
  const [mountWindow, setMountWindow] = useState<RowMountWindow>(() =>
    progressiveWindow(tailDepth, anchorBottom),
  );
  const heightsRef = useRef(new Map<number, MeasuredRow>());
  const rowOffsetsRef = useRef<number[]>([]);
  const firstRowOffsetRef = useRef(0);
  const containerWidthRef = useRef<number>();
  const anchorRef = useRef<{ element: Element; documentOffset: number } | null>(null);
  const updateFrameRef = useRef<number>();
  const leaseCountRef = useRef(0);
  const leaseEpochRef = useRef(0);
  const remeasuringRef = useRef(false);
  const remeasureAnchorRef = useRef<{ messageId: string; viewportTop: number } | null>(null);
  const tailDepthRef = useRef(tailDepth);
  const isSubmittingRef = useRef(isSubmitting);
  tailDepthRef.current = tailDepth;
  isSubmittingRef.current = isSubmitting;

  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (prevConversationId !== conversationId) {
    setPrevConversationId(conversationId);
    heightsRef.current = new Map();
    rowOffsetsRef.current = [];
    containerWidthRef.current = undefined;
    leaseCountRef.current = 0;
    leaseEpochRef.current += 1;
    remeasuringRef.current = false;
    remeasureAnchorRef.current = null;
    setMountWindow(progressiveWindow(tailDepth, anchorBottom));
    anchorRef.current = null;
  }

  const captureAnchor = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || !anchorBottom) {
      anchorRef.current = null;
      return;
    }
    const element = container.querySelector('.message-render');
    anchorRef.current = element
      ? { element, documentOffset: element.getBoundingClientRect().top + container.scrollTop }
      : null;
  }, [anchorBottom, scrollableRef]);

  const rebuildRowOffsets = useCallback(() => {
    const currentTailDepth = tailDepthRef.current;
    if (currentTailDepth == null) {
      rowOffsetsRef.current = [];
      return;
    }
    const offsets = new Array<number>(currentTailDepth + 2);
    offsets[0] = firstRowOffsetRef.current;
    for (let depth = 0; depth <= currentTailDepth; depth += 1) {
      const measured = heightsRef.current.get(depth);
      if (!measured) {
        rowOffsetsRef.current = [];
        return;
      }
      offsets[depth + 1] = offsets[depth] + measured.height;
    }
    rowOffsetsRef.current = offsets;
  }, []);

  const measureMountedRows = useCallback(() => {
    const container = scrollableRef.current;
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const rows = container.querySelectorAll<HTMLElement>(MOUNTED_ROW_SLOT_SELECTOR);
    for (const row of rows) {
      const metadata = rowMetadata(row);
      if (!metadata) {
        continue;
      }
      const height = row.getBoundingClientRect().height;
      if (height <= 0) {
        continue;
      }
      heightsRef.current.set(metadata.depth, { messageId: metadata.messageId, height });
      if (metadata.depth === 0) {
        firstRowOffsetRef.current =
          row.getBoundingClientRect().top - containerRect.top + container.scrollTop;
      }
    }
    rebuildRowOffsets();
  }, [rebuildRowOffsets, scrollableRef]);

  const measureRow = useCallback(
    (depth: number, messageId: string, height: number) => {
      if (height <= 0) {
        return;
      }
      const previous = heightsRef.current.get(depth);
      if (previous?.messageId === messageId && Math.abs(previous.height - height) < 0.5) {
        return;
      }
      heightsRef.current.set(depth, { messageId, height });
      const offsets = rowOffsetsRef.current;
      const currentTailDepth = tailDepthRef.current;
      if (previous && currentTailDepth != null && offsets.length === currentTailDepth + 2) {
        const heightDelta = height - previous.height;
        for (let index = depth + 1; index < offsets.length; index += 1) {
          offsets[index] += heightDelta;
        }
      } else {
        rebuildRowOffsets();
      }
      /** Same-message resizes only affect mounted rows. The next window
       *  refresh publishes the cache before a resized row can become a slot,
       *  avoiding an O(n) Map copy for every streamed height update. */
      if (previous?.messageId !== messageId) {
        setMountWindow((current) => {
          if (current?.mode !== 'bounded') {
            return current;
          }
          return { ...current, heights: new Map(heightsRef.current) };
        });
      }
    },
    [rebuildRowOffsets],
  );

  const boundedWindow = useCallback((): RowMountWindow => {
    const container = scrollableRef.current;
    const currentTailDepth = tailDepthRef.current;
    if (!container || currentTailDepth == null || currentTailDepth + 1 <= MIN_WINDOWED_ROWS) {
      return null;
    }

    const offsets = rowOffsetsRef.current;
    let firstVisible: number;
    let lastVisible: number;
    if (offsets.length !== currentTailDepth + 2) {
      const anchor = anchorBottom ? currentTailDepth : 0;
      firstVisible = anchor;
      lastVisible = anchor;
    } else {
      const findDepth = (position: number) => {
        let low = 0;
        let high = currentTailDepth;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (offsets[middle + 1] < position) low = middle + 1;
          else high = middle;
        }
        return low;
      };
      const findLastDepth = (position: number) => {
        let low = 0;
        let high = currentTailDepth;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (offsets[middle] <= position) low = middle;
          else high = middle - 1;
        }
        return low;
      };
      firstVisible = findDepth(container.scrollTop);
      lastVisible = findLastDepth(container.scrollTop + container.clientHeight);
    }

    return {
      mode: 'bounded',
      start: Math.max(0, firstVisible - WINDOW_OVERSCAN_ROWS),
      end: Math.min(currentTailDepth, lastVisible + WINDOW_OVERSCAN_ROWS),
      tailStart: isSubmittingRef.current
        ? Math.max(0, currentTailDepth - STREAM_TAIL_ROWS + 1)
        : undefined,
      heights: new Map(heightsRef.current),
      measureRow,
    };
  }, [anchorBottom, measureRow, scrollableRef]);

  const restartMeasurement = useCallback(() => {
    if (remeasuringRef.current || leaseCountRef.current > 0) return;
    const container = scrollableRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const slots = container.querySelectorAll<HTMLElement>('[data-message-row-slot="true"]');
    const anchor = [...slots].find((slot) => slot.getBoundingClientRect().bottom >= containerTop);
    remeasureAnchorRef.current = anchor
      ? {
          messageId: anchor.dataset.rowMessageId ?? '',
          viewportTop: anchor.getBoundingClientRect().top,
        }
      : null;
    remeasuringRef.current = true;
    heightsRef.current = new Map();
    rowOffsetsRef.current = [];
    setMountWindow(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        measureMountedRows();
        setMountWindow(boundedWindow());
        remeasuringRef.current = false;
      }),
    );
  }, [boundedWindow, measureMountedRows, scrollableRef]);

  const refreshBoundedWindow = useCallback(() => {
    setMountWindow((current) => {
      if (current?.mode !== 'bounded') {
        return current;
      }
      const next = boundedWindow();
      if (
        next?.mode === 'bounded' &&
        current.start === next.start &&
        current.end === next.end &&
        current.tailStart === next.tailStart
      ) {
        return current;
      }
      return next;
    });
  }, [boundedWindow]);

  const scheduleBoundedRefresh = useCallback(() => {
    if (updateFrameRef.current != null) {
      return;
    }
    updateFrameRef.current = requestAnimationFrame(() => {
      updateFrameRef.current = undefined;
      refreshBoundedWindow();
    });
  }, [refreshBoundedWindow]);

  useEffect(() => {
    if (mountWindow?.mode !== 'progressive' || tailDepth == null) {
      return;
    }
    if (mountWindow.start <= 0 && mountWindow.end >= tailDepth) {
      const frameId = requestAnimationFrame(() => {
        measureMountedRows();
        setMountWindow(boundedWindow());
      });
      return () => cancelAnimationFrame(frameId);
    }
    const frameId = requestAnimationFrame(() => {
      captureAnchor();
      startTransition(() => {
        setMountWindow((current) => {
          if (current?.mode !== 'progressive') {
            return current;
          }
          return {
            ...current,
            start: Math.max(0, current.start - CHUNK_ROWS),
            end: current.end >= tailDepth ? current.end : current.end + CHUNK_ROWS,
            tailStart: isSubmitting ? Math.max(0, tailDepth - STREAM_TAIL_ROWS + 1) : undefined,
          };
        });
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [mountWindow, tailDepth, boundedWindow, captureAnchor, isSubmitting, measureMountedRows]);

  useEffect(() => {
    if (
      mountWindow != null ||
      remeasuringRef.current ||
      leaseCountRef.current > 0 ||
      tailDepth == null ||
      tailDepth + 1 <= MIN_WINDOWED_ROWS ||
      heightsRef.current.size > 0
    ) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      measureMountedRows();
      setMountWindow(boundedWindow());
    });
    return () => cancelAnimationFrame(frameId);
  }, [mountWindow, tailDepth, boundedWindow, measureMountedRows]);

  useLayoutEffect(() => {
    const captured = anchorRef.current;
    anchorRef.current = null;
    const container = scrollableRef.current;
    if (!captured || !container || !captured.element.isConnected) {
      return;
    }
    const shift =
      captured.element.getBoundingClientRect().top + container.scrollTop - captured.documentOffset;
    if (shift !== 0) {
      container.scrollTop += shift;
    }
  }, [mountWindow, scrollableRef]);

  useLayoutEffect(() => {
    const captured = remeasureAnchorRef.current;
    const container = scrollableRef.current;
    if (!captured || !container) return;
    const anchor = [
      ...container.querySelectorAll<HTMLElement>('[data-message-row-slot="true"]'),
    ].find((slot) => slot.dataset.rowMessageId === captured.messageId);
    if (anchor) container.scrollTop += anchor.getBoundingClientRect().top - captured.viewportTop;
    if (mountWindow?.mode === 'bounded') remeasureAnchorRef.current = null;
  }, [mountWindow, scrollableRef]);

  const previousLayoutKeyRef = useRef(layoutKey);
  useEffect(() => {
    if (previousLayoutKeyRef.current === layoutKey) return;
    previousLayoutKeyRef.current = layoutKey;
    restartMeasurement();
  }, [layoutKey, restartMeasurement]);

  useEffect(() => {
    if (mountWindow?.mode !== 'bounded') {
      return;
    }
    const container = scrollableRef.current;
    if (!container) {
      return;
    }
    container.addEventListener('scroll', scheduleBoundedRefresh, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(([entry]) => {
            const nextWidth = entry?.contentRect.width ?? container.getBoundingClientRect().width;
            if (containerWidthRef.current == null) {
              containerWidthRef.current = nextWidth;
              return;
            }
            if (Math.abs(containerWidthRef.current - nextWidth) >= 0.5) {
              containerWidthRef.current = nextWidth;
              restartMeasurement();
              return;
            }
            scheduleBoundedRefresh();
          });
    resizeObserver?.observe(container);
    return () => {
      container.removeEventListener('scroll', scheduleBoundedRefresh);
      resizeObserver?.disconnect();
    };
  }, [mountWindow?.mode, restartMeasurement, scheduleBoundedRefresh, scrollableRef]);

  useEffect(() => {
    if (mountWindow?.mode !== 'bounded') {
      return;
    }
    scheduleBoundedRefresh();
  }, [isSubmitting, tailDepth, mountWindow?.mode, scheduleBoundedRefresh]);

  useEffect(
    () => () => {
      if (updateFrameRef.current != null) {
        cancelAnimationFrame(updateFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (tailDepth == null || tailDepth + 1 <= MIN_WINDOWED_ROWS) {
      return;
    }
    const complete = () =>
      new Promise<() => void>((resolve) => {
        const leaseEpoch = leaseEpochRef.current;
        leaseCountRef.current += 1;
        if (leaseCountRef.current === 1) setMountWindow(null);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            let released = false;
            resolve(() => {
              if (released || leaseEpoch !== leaseEpochRef.current) return;
              released = true;
              leaseCountRef.current = Math.max(0, leaseCountRef.current - 1);
              if (leaseCountRef.current === 0) {
                measureMountedRows();
                setMountWindow(boundedWindow());
              }
            });
          }),
        );
      });
    activeCompleters.add(complete);
    return () => {
      activeCompleters.delete(complete);
    };
  }, [tailDepth, boundedWindow, measureMountedRows]);

  return mountWindow;
}

const activeCompleters = new Set<() => Promise<() => void>>();

/** Temporarily mounts every row for a full-DOM consumer such as screenshot export. */
export async function completeProgressiveRowMounts(): Promise<() => void> {
  if (activeCompleters.size === 0) {
    return () => {};
  }
  const releases = await Promise.all([...activeCompleters].map((complete) => complete()));
  return () => {
    for (const release of releases) {
      release();
    }
  };
}
