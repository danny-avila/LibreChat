import { useCallback, useLayoutEffect, useState } from 'react';

interface ElementSize {
  width: number;
  height: number;
}

interface UseElementSizeResult<T extends HTMLElement> {
  ref: (node: T | null) => void;
  width: number;
  height: number;
}

/**
 * Tracks an element's content-box size via ResizeObserver. Returns a callback
 * ref so conditionally rendered elements are re-observed when they remount.
 */
export default function useElementSize<T extends HTMLElement>(): UseElementSizeResult<T> {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((element: T | null) => setNode(element), []);

  useLayoutEffect(() => {
    if (!node) {
      return;
    }
    if (typeof ResizeObserver === 'undefined') {
      setSize({ width: node.offsetWidth, height: node.offsetHeight });
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { ref, width: size.width, height: size.height };
}
