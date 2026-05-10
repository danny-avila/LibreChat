import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { throttle } from 'lodash';

interface UseInfiniteScrollOptions {
  hasNextPage?: boolean;
  isLoading?: boolean;
  fetchNextPage: () => void;
  threshold?: number; // Percentage of scroll position to trigger fetch (0-1)
  throttleMs?: number; // Throttle delay in milliseconds
}

/**
 * Custom hook for implementing infinite scroll functionality
 * Detects when user scrolls near the bottom and triggers data fetching
 */
export const useInfiniteScroll = ({
  hasNextPage = false,
  isLoading = false,
  fetchNextPage,
  threshold = 0.8, // Trigger when 80% scrolled
  throttleMs = 200,
}: UseInfiniteScrollOptions) => {
  // Monitor resizing of the scroll container
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [scrollElement, setScrollElementState] = useState<HTMLElement | null>(null);

  // Handler to check if we need to fetch more data
  const handleNeedToFetch = useCallback(() => {
    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;

    // Calculate scroll position as percentage
    const scrollPosition = (scrollTop + clientHeight) / scrollHeight;

    // Check if we've scrolled past the threshold and conditions are met
    const shouldFetch = scrollPosition >= threshold && hasNextPage && !isLoading;

    if (shouldFetch) {
      fetchNextPage();
    }
  }, [scrollElement, hasNextPage, isLoading, fetchNextPage, threshold]);

  // Create a throttled version - using useMemo to ensure it's created synchronously
  const throttledHandleNeedToFetch = useMemo(
    () => throttle(handleNeedToFetch, throttleMs),
    [handleNeedToFetch, throttleMs],
  );

  // Clean up throttled function on unmount
  useEffect(() => {
    return () => {
      throttledHandleNeedToFetch.cancel?.();
    };
  }, [throttledHandleNeedToFetch]);

  // Check if we need to fetch more data when loading state changes (useful to fill content on first load)
  useEffect(() => {
    if (isLoading === false && scrollElement) {
      // Use requestAnimationFrame to ensure DOM is ready after loading completes
      const rafId = requestAnimationFrame(() => {
        throttledHandleNeedToFetch();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [isLoading, scrollElement, throttledHandleNeedToFetch]);

  // Set up scroll listener and ResizeObserver
  useEffect(() => {
    const element = scrollElement;
    if (!element) return;

    // Add the scroll listener
    element.addEventListener('scroll', throttledHandleNeedToFetch, { passive: true });

    // Set up ResizeObserver to detect size changes
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      // Check if we need to fetch more data when container resizes
      throttledHandleNeedToFetch();
    });

    resizeObserverRef.current.observe(element);

    // Check immediately when element changes
    throttledHandleNeedToFetch();

    return () => {
      element.removeEventListener('scroll', throttledHandleNeedToFetch);
      // Clean up ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [scrollElement, throttledHandleNeedToFetch]);

  // Function to manually set the scroll container
  const setScrollElement = useCallback((element: HTMLElement | null) => {
    setScrollElementState(element);
  }, []);

  return {
    setScrollElement,
  };
};
