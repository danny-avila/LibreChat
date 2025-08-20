import { useCallback, useEffect, useRef } from 'react';
import { throttle } from 'lodash';

interface UseInfiniteScrollOptions {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
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
  isFetchingNextPage = false,
  fetchNextPage,
  threshold = 0.8, // Trigger when 80% scrolled
  throttleMs = 200,
}: UseInfiniteScrollOptions) => {
  const scrollElementRef = useRef<HTMLElement | null>(null);

  // Throttled scroll handler to prevent excessive API calls
  const handleScroll = useCallback(
    throttle(() => {
      const element = scrollElementRef.current;
      if (!element) return;

      const { scrollTop, scrollHeight, clientHeight } = element;

      // Calculate scroll position as percentage
      const scrollPosition = (scrollTop + clientHeight) / scrollHeight;

      // Check if we've scrolled past the threshold and conditions are met
      const shouldFetch = scrollPosition >= threshold && hasNextPage && !isFetchingNextPage;

      if (shouldFetch) {
        fetchNextPage();
      }
    }, throttleMs),
    [hasNextPage, isFetchingNextPage, fetchNextPage, threshold, throttleMs],
  );

  // Set up scroll listener
  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;

    // Remove any existing listener first
    element.removeEventListener('scroll', handleScroll);

    // Add the new listener
    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      // Clean up throttled function
      handleScroll.cancel?.();
    };
  }, [handleScroll]);

  // Additional effect to re-setup listeners when scroll element changes
  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;
    // Remove any existing listener first
    element.removeEventListener('scroll', handleScroll);

    // Add the new listener
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      // Clean up throttled function
      handleScroll.cancel?.();
    };
  }, [scrollElementRef.current, handleScroll]);

  // Function to manually set the scroll container
  const setScrollElement = useCallback((element: HTMLElement | null) => {
    scrollElementRef.current = element;
  }, []);

  return {
    setScrollElement,
    scrollElementRef,
  };
};

export default useInfiniteScroll;
