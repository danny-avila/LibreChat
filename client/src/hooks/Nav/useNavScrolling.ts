import { useCallback, useEffect, useRef } from 'react';
import type { FetchNextPageOptions, InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';

export default function useNavScrolling({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: {
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: (
    options?: FetchNextPageOptions | undefined,
  ) => Promise<InfiniteQueryObserverResult<ConversationListResponse, unknown>>;
}) {
  const scrollPositionRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
      const nearBottomOfList = scrollTop + clientHeight >= scrollHeight * 0.8;

      if (nearBottomOfList && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const moveToTop = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  }, [containerRef, scrollPositionRef]);

  return {
    containerRef,
    moveToTop,
  };
}
