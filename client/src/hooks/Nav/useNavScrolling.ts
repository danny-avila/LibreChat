import throttle from 'lodash/throttle';
import React, { useCallback, useEffect, useRef } from 'react';
import type { FetchNextPageOptions, InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';

export default function useNavScrolling({
  hasNextPage,
  isFetchingNextPage,
  setShowLoading,
  fetchNextPage,
}: {
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  setShowLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fetchNextPage: (
    options?: FetchNextPageOptions | undefined,
  ) => Promise<InfiniteQueryObserverResult<ConversationListResponse, unknown>>;
}) {
  const scrollPositionRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchNext = useCallback(
    throttle(() => fetchNextPage(), 750, { leading: true }),
    [fetchNextPage],
  );

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
      const nearBottomOfList = scrollTop + clientHeight >= scrollHeight * 0.97;

      if (nearBottomOfList && hasNextPage && !isFetchingNextPage) {
        setShowLoading(true);
        fetchNext();
      } else {
        setShowLoading(false);
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNext, setShowLoading]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }

    return () => {
      container?.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, fetchNext]);

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
