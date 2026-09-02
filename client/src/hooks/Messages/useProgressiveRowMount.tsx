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
const ROW_SLOT_SELECTOR = '[data-message-row-slot="true"]';
const MOUNTED_ROW_SLOT_SELECTOR = `${ROW_SLOT_SELECTOR}[data-row-mounted="true"]`;

type ProgressiveRowMountOptions = {
  tailDepth: number | undefined;
  anchorBottom: boolean;
  isSubmitting: boolean;
  conversationId: string | null | undefined;
  scrollableRef: RefObject<HTMLDivElement | null>;
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
}: ProgressiveRowMountOptions): RowMountWindow {
  const [mountWindow, setMountWindow] = useState<RowMountWindow>(() =>
    progressiveWindow(tailDepth, anchorBottom),
  );
  const heightsRef = useRef(new Map<number, MeasuredRow>());
  const anchorRef = useRef<{ element: Element; documentOffset: number } | null>(null);
  const updateFrameRef = useRef<number>();
  const tailDepthRef = useRef(tailDepth);
  const isSubmittingRef = useRef(isSubmitting);
  tailDepthRef.current = tailDepth;
  isSubmittingRef.current = isSubmitting;

  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (prevConversationId !== conversationId) {
    setPrevConversationId(conversationId);
    heightsRef.current = new Map();
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

  const measureMountedRows = useCallback(() => {
    const container = scrollableRef.current;
    if (!container) {
      return;
    }
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
    }
  }, [scrollableRef]);

  const measureRow = useCallback((depth: number, messageId: string, height: number) => {
    if (height <= 0) {
      return;
    }
    const previous = heightsRef.current.get(depth);
    heightsRef.current.set(depth, { messageId, height });
    if (previous == null || previous.messageId === messageId) {
      return;
    }
    setMountWindow((current) => {
      if (current?.mode !== 'bounded') {
        return current;
      }
      return { ...current, heights: new Map(heightsRef.current) };
    });
  }, []);

  const boundedWindow = useCallback((): RowMountWindow => {
    const container = scrollableRef.current;
    const currentTailDepth = tailDepthRef.current;
    if (!container || currentTailDepth == null || currentTailDepth + 1 <= MIN_WINDOWED_ROWS) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    let firstVisible = Number.POSITIVE_INFINITY;
    let lastVisible = Number.NEGATIVE_INFINITY;
    const slots = container.querySelectorAll<HTMLElement>(ROW_SLOT_SELECTOR);
    for (const slot of slots) {
      const metadata = rowMetadata(slot);
      if (!metadata) {
        continue;
      }
      const rect = slot.getBoundingClientRect();
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
        continue;
      }
      firstVisible = Math.min(firstVisible, metadata.depth);
      lastVisible = Math.max(lastVisible, metadata.depth);
    }

    if (!Number.isFinite(firstVisible) || !Number.isFinite(lastVisible)) {
      const anchor = anchorBottom ? currentTailDepth : 0;
      firstVisible = anchor;
      lastVisible = anchor;
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

  const refreshBoundedWindow = useCallback(() => {
    measureMountedRows();
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
  }, [boundedWindow, measureMountedRows]);

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
          };
        });
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [mountWindow, tailDepth, boundedWindow, captureAnchor, measureMountedRows]);

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
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleBoundedRefresh);
    resizeObserver?.observe(container);
    return () => {
      container.removeEventListener('scroll', scheduleBoundedRefresh);
      resizeObserver?.disconnect();
    };
  }, [mountWindow?.mode, scheduleBoundedRefresh, scrollableRef]);

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

  const isWindowActive = mountWindow != null;
  useEffect(() => {
    if (!isWindowActive) {
      return;
    }
    const complete = () =>
      new Promise<() => void>((resolve) => {
        setMountWindow(null);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve(() => {
              measureMountedRows();
              setMountWindow(boundedWindow());
            });
          }),
        );
      });
    activeCompleters.add(complete);
    return () => {
      activeCompleters.delete(complete);
    };
  }, [isWindowActive, boundedWindow, measureMountedRows]);

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
