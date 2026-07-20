import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { Spinner, useToastContext } from '@librechat/client';
import { List, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import type { Index, ListRowProps } from 'react-virtualized';
import type { TMessage } from 'librechat-data-provider';
import type { SearchNavEntry } from '~/components/Chat/Messages/SearchNav';
import { extractPreviewFromContent } from '~/components/Chat/Messages/MessageNav';
import { useElementSize, useLocalize, useAuthContext } from '~/hooks';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import SearchNav from '~/components/Chat/Messages/SearchNav';
import { useMessagesInfiniteQuery } from '~/data-provider';
import { useFileMapContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

type MeasuredCellParent = {
  invalidateCellSizeAfterRender?: (cell: { columnIndex: number; rowIndex: number }) => void;
  recomputeGridSize?: (cell: { columnIndex: number; rowIndex: number }) => void;
};

/** Virtualized row wrapper that reports its measured height back to the cache. */
const MeasuredRow: FC<{
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}> = memo(({ cache, rowKey, parent, index, style, children }) => (
  <CellMeasurer
    cache={cache}
    columnIndex={0}
    key={rowKey}
    parent={parent as ListRowProps['parent']}
    rowIndex={index}
  >
    {({ registerChild }) => (
      <div
        ref={registerChild as React.LegacyRef<HTMLDivElement>}
        style={style}
        data-testid="search-result-row"
      >
        {children}
      </div>
    )}
  </CellMeasurer>
));

MeasuredRow.displayName = 'SearchMeasuredRow';

const SCROLL_DURATION = 400;
const PREVIEW_MAX = 80;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function buildPreview(message: TMessage): string {
  const raw = message.text?.trim() ? message.text : extractPreviewFromContent(message.content);
  const trimmed = raw.trim();
  return trimmed.slice(0, PREVIEW_MAX) + (trimmed.length > PREVIEW_MAX ? '...' : '');
}

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { isAuthenticated } = useAuthContext();
  const search = useRecoilValue(store.search);
  const searchQuery = search.debouncedQuery;

  const {
    data: searchMessages,
    isLoading,
    isError,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
  } = useMessagesInfiniteQuery(
    { search: searchQuery || undefined },
    { enabled: isAuthenticated && !!searchQuery, staleTime: 30000, cacheTime: 300000 },
  );

  const messages = useMemo(
    () =>
      searchMessages?.pages.flatMap((page) =>
        page.messages.map((message) => {
          if (!message.files || !fileMap) {
            return message;
          }
          return {
            ...message,
            files: message.files.map((file) => fileMap[file.file_id ?? ''] ?? file),
          };
        }),
      ) ?? [],
    [fileMap, searchMessages?.pages],
  );

  /** keyMapper reads a ref so the cache is created once and heights stay keyed
   *  to messageId (stable across pagination/reorders), not row index. */
  const itemsRef = useRef<TMessage[]>(messages);
  itemsRef.current = messages;

  const listRef = useRef<List>(null);
  const {
    ref: listContainerRef,
    width: listWidth,
    height: listHeight,
  } = useElementSize<HTMLDivElement>();

  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: 140,
        keyMapper: (index) => itemsRef.current[index]?.messageId ?? `search-row-${index}`,
      }),
    [],
  );

  const recompute = useCallback(
    (clear: boolean) => {
      if (clear) {
        cache.clearAll();
      }
      listRef.current?.recomputeRowHeights(0);
    },
    [cache],
  );

  /** Rendered row window reported by the List; `start` doubles as the current
   *  (topmost visible) row and `[start..stop]` as the lit rib set. */
  const [range, setRange] = useState<{ start: number; stop: number } | null>(null);
  const scrollTopRef = useRef(0);
  const scrollTokenRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  /** A fresh query re-seeds the list from the top; drop the stale window. */
  useEffect(() => {
    setRange(null);
    scrollTopRef.current = 0;
  }, [searchQuery]);

  const navEntries = useMemo<SearchNavEntry[]>(() => {
    const list: SearchNavEntry[] = messages.map((message, index) => ({
      id: message.messageId ?? `search-row-${index}`,
      index,
      isUser: message.isCreatedByUser === true,
      isEnd: false,
      preview: buildPreview(message),
    }));
    if (list.length > 0) {
      list.push({
        id: 'search-nav-end',
        index: list.length - 1,
        isUser: false,
        isEnd: true,
        preview: '',
      });
    }
    return list;
  }, [messages]);

  const visibleIndices = useMemo(() => {
    const set = new Set<number>();
    if (range) {
      for (let i = range.start; i <= range.stop; i++) {
        set.add(i);
      }
    }
    return set;
  }, [range]);

  const currentIndex = range ? range.start : null;

  const handleScroll = useCallback(({ scrollTop }: { scrollTop: number }) => {
    scrollTopRef.current = scrollTop;
  }, []);

  /** Seam 2: scroll the virtualized list to a row. A row may be unmounted, so we
   *  sum measured heights to find its offset and animate scrollToPosition, then
   *  snap with scrollToRow so the landing is exact even if the row re-measures. */
  const onJump = useCallback(
    (index: number, smooth: boolean) => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      if (!smooth || reducedMotionRef.current) {
        list.scrollToRow(index);
        return;
      }
      let target = 0;
      for (let i = 0; i < index; i++) {
        target += cache.getHeight(i, 0);
      }
      const startScroll = scrollTopRef.current;
      const startTime = performance.now();
      const token = ++scrollTokenRef.current;
      const step = (now: number) => {
        if (token !== scrollTokenRef.current || !listRef.current) {
          return;
        }
        const progress = Math.min(1, (now - startTime) / SCROLL_DURATION);
        listRef.current.scrollToPosition(
          startScroll + (target - startScroll) * easeOutCubic(progress),
        );
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          listRef.current.scrollToRow(index);
        }
      };
      requestAnimationFrame(step);
    },
    [cache],
  );

  /** New result set (query changed): drop measured heights and recompute. */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => recompute(true));
    return () => cancelAnimationFrame(frameId);
  }, [searchQuery, recompute]);

  /** Appended page (row count grew): recompute offsets, keep existing measures. */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => recompute(false));
    return () => cancelAnimationFrame(frameId);
  }, [messages.length, recompute]);

  /** fixedWidth cache keys heights by row, not width — re-measure on width change. */
  const measuredWidthRef = useRef(0);
  useEffect(() => {
    if (listWidth === 0 || listWidth === measuredWidthRef.current) {
      return;
    }
    measuredWidthRef.current = listWidth;
    const frameId = requestAnimationFrame(() => recompute(true));
    return () => cancelAnimationFrame(frameId);
  }, [listWidth, recompute]);

  const throttledFetchNext = useMemo(
    () => throttle(() => fetchNextPage(), 500, { leading: true }),
    [fetchNextPage],
  );

  const handleRowsRendered = useCallback(
    ({ startIndex, stopIndex }: { startIndex: number; stopIndex: number }) => {
      if (hasNextPage && !isFetchingNextPage && stopIndex >= messages.length - 8) {
        throttledFetchNext();
      }
      setRange((prev) =>
        prev && prev.start === startIndex && prev.stop === stopIndex
          ? prev
          : { start: startIndex, stop: stopIndex },
      );
    },
    [hasNextPage, isFetchingNextPage, messages.length, throttledFetchNext],
  );

  const rowRenderer = useCallback(
    ({ index, key, parent, style }: ListRowProps) => (
      <MeasuredRow
        cache={cache}
        rowKey={key}
        parent={parent as MeasuredCellParent}
        index={index}
        style={style}
      >
        <SearchMessage message={messages[index]} />
      </MeasuredRow>
    ),
    [cache, messages],
  );

  const getRowHeight = useCallback(({ index }: Index) => cache.getHeight(index, 0), [cache]);

  useEffect(() => {
    if (isError && searchQuery) {
      showToast({ message: 'An error occurred during search', status: 'error' });
    }
  }, [isError, searchQuery, showToast]);

  const resultsCount = messages.length;
  const resultsAnnouncement = useMemo(() => {
    if (resultsCount === 0) {
      return localize('com_ui_nothing_found');
    }
    if (resultsCount === 1) {
      return localize('com_ui_result_found', { count: resultsCount });
    }
    return localize('com_ui_results_found', { count: resultsCount });
  }, [resultsCount, localize]);

  if (!searchQuery) {
    return null;
  }

  const hasResults = resultsCount > 0;

  /** Only the FIRST load (no results yet) shows the full-screen spinner.
   *  `keepPreviousData` on the query keeps prior results mounted across query
   *  changes, so typing no longer unmounts + re-parses the whole list. */
  if ((isLoading || search.isTyping) && !hasResults) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-lg bg-white p-6 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
          {localize('com_ui_nothing_found')}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-white pt-4 dark:bg-gray-800">
      <div className="sr-only" role="alert" aria-atomic="true">
        {resultsAnnouncement}
      </div>
      <div ref={listContainerRef} className="min-h-0 flex-1">
        <List
          ref={listRef}
          width={listWidth}
          height={listHeight}
          deferredMeasurementCache={cache}
          rowCount={resultsCount}
          rowHeight={getRowHeight}
          rowRenderer={rowRenderer}
          onRowsRendered={handleRowsRendered}
          onScroll={handleScroll}
          overscanRowCount={10}
          aria-label={localize('com_nav_search_placeholder')}
          className={cn('outline-none', search.isTyping && 'opacity-70')}
          style={{ outline: 'none' }}
        />
      </div>
      <SearchNav
        entries={navEntries}
        currentIndex={currentIndex}
        visibleIndices={visibleIndices}
        onJump={onJump}
      />
      {isFetchingNextPage && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center py-4">
          <Spinner className="text-text-primary" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-800" />
    </div>
  );
}
