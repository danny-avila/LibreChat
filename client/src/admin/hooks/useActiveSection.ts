import { useCallback, useEffect, useRef } from 'react';

/** Keeps the active TOC item visible inside the TOC's own scroll area (SH-4). */
function keepInView(item: Element) {
  const scroller = item.closest<HTMLElement>('[data-toc-scroller]');
  if (!scroller || !(item instanceof HTMLElement)) return;
  requestAnimationFrame(() => {
    const itemRect = item.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (itemRect.top < box.top) scroller.scrollTop -= box.top - itemRect.top + 8;
    else if (itemRect.bottom > box.bottom) scroller.scrollTop += itemRect.bottom - box.bottom + 8;
  });
}

/**
 * Tracks the active TOC section using a simple scroll-position approach:
 * on each scroll frame, find the last `[data-section-id]` header whose top
 * is at or above a fixed offset from the container top. No IntersectionObserver
 * complexity — just a direct position check that works reliably for both
 * tall expanded sections and small collapsed headers.
 *
 * Returns a `setActiveImmediate` callback the TOC can call on click to
 * set the active state instantly and suppress scroll updates briefly.
 */
export function useActiveSection(
  scrollContainer: HTMLElement | null,
  tocContainer: HTMLElement | null,
  resetKey?: string,
): (id: string) => void {
  const activeRef = useRef<string | null>(null);
  const suppressedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyActive = useCallback(
    (id: string | null) => {
      if (!id || id === activeRef.current) return;
      activeRef.current = id;
      if (!tocContainer) return;
      const prev = tocContainer.querySelector('[data-toc-active]');
      if (prev) prev.removeAttribute('data-toc-active');
      const next = tocContainer.querySelector(`[data-toc-id="${CSS.escape(id)}"]`);
      if (next) {
        next.setAttribute('data-toc-active', '');
        keepInView(next);
      }
    },
    [tocContainer],
  );

  const setActiveImmediate = useCallback(
    (id: string) => {
      suppressedRef.current = true;
      clearTimeout(settleTimerRef.current);
      activeRef.current = id;
      if (!tocContainer) return;
      const prev = tocContainer.querySelector('[data-toc-active]');
      if (prev) prev.removeAttribute('data-toc-active');
      const next = tocContainer.querySelector(`[data-toc-id="${CSS.escape(id)}"]`);
      if (next) {
        next.setAttribute('data-toc-active', '');
        keepInView(next);
      }
    },
    [tocContainer],
  );

  useEffect(() => {
    if (!scrollContainer) return;

    activeRef.current = null;
    suppressedRef.current = false;
    clearTimeout(settleTimerRef.current);
    if (tocContainer) {
      const prev = tocContainer.querySelector('[data-toc-active]');
      if (prev) prev.removeAttribute('data-toc-active');
    }

    const PROBE_OFFSET = 100;

    const pickActive = () => {
      if (suppressedRef.current) return;
      if (!tocContainer) return;

      // Build set of IDs that actually have TOC entries
      const tocIds = new Set<string>();
      for (const btn of tocContainer.querySelectorAll<HTMLElement>('[data-toc-id]')) {
        const id = btn.getAttribute('data-toc-id');
        if (id) tocIds.add(id);
      }

      const containerTop = scrollContainer.getBoundingClientRect().top;
      const probeY = containerTop + PROBE_OFFSET;
      const containerBottom = scrollContainer.getBoundingClientRect().bottom;
      const headers = scrollContainer.querySelectorAll<HTMLElement>('[data-section-id]');

      // Find the last TOC-eligible header whose top is at or above the probe point.
      // This works regardless of id naming conventions or nesting depth.
      let bestId: string | null = null;
      for (const header of headers) {
        const id = header.getAttribute('data-section-id') ?? '';
        if (!tocIds.has(id)) continue;
        const top = header.getBoundingClientRect().top;
        if (top <= probeY) bestId = id;
      }

      // Near-bottom override: when scrolled to the bottom, pick the last visible
      // TOC-eligible header — it may never reach the probe point.
      const atBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 50;

      if (atBottom) {
        let lastId: string | null = null;
        for (const header of headers) {
          const id = header.getAttribute('data-section-id') ?? '';
          if (!tocIds.has(id)) continue;
          if (header.getBoundingClientRect().top < containerBottom) lastId = id;
        }
        if (lastId) {
          applyActive(lastId);
          return;
        }
      }

      if (bestId) applyActive(bestId);
    };

    let scrollRaf = 0;
    const onScroll = () => {
      if (suppressedRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
          suppressedRef.current = false;
          pickActive();
        }, 150);
        return;
      }
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(pickActive);
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });

    // Initial pick after DOM settles
    const initTimer = setTimeout(pickActive, 100);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(settleTimerRef.current);
      cancelAnimationFrame(scrollRaf);
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer, tocContainer, applyActive, resetKey]);

  return setActiveImmediate;
}
