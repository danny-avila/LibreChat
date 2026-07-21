import { memo, useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { useAtomValue } from 'jotai';
import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { Spinner, useToastContext } from '@librechat/client';
import { List, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import type { Index, ListRowProps } from 'react-virtualized';
import type { TMessage } from 'librechat-data-provider';
import { useElementSize, useLocalize, useAuthContext } from '~/hooks';
import SearchMessage from '~/components/Chat/Messages/SearchMessage';
import { useMessagesInfiniteQuery } from '~/data-provider';
import { useFileMapContext } from '~/Providers';
import { fontSizeAtom } from '~/store/fontSize';
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

export default function Search() {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { isAuthenticated } = useAuthContext();
  const search = useRecoilValue(store.search);
  const fontSize = useAtomValue(fontSizeAtom);
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

  /** A new query or a font-size change invalidates every measured height. */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => recompute(true));
    return () => cancelAnimationFrame(frameId);
  }, [searchQuery, fontSize, recompute]);

  /** Appending a page keeps existing measures; any other content change at the
   *  same row count (a file preview resolving, a refetch) can alter a row's
   *  rendered height, so drop the stale heights and re-measure. */
  const prevCountRef = useRef(0);
  useEffect(() => {
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    const frameId = requestAnimationFrame(() => recompute(!grew));
    return () => cancelAnimationFrame(frameId);
  }, [messages, recompute]);

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
    ({ stopIndex }: { stopIndex: number }) => {
      /** Prior results stay mounted while typing; don't page the outgoing query
       *  before the debounce settles onto the new one. */
      if (search.isTyping || !hasNextPage || isFetchingNextPage) {
        return;
      }
      if (stopIndex >= messages.length - 8) {
        throttledFetchNext();
      }
    },
    [search.isTyping, hasNextPage, isFetchingNextPage, messages.length, throttledFetchNext],
  );

  const rowRenderer = useCallback(
    ({ index, key, parent, style }: ListRowProps) => {
      const message = messages[index];
      /** react-virtualized's `key` is positional; key by messageId so React
       *  reconciles rows by message, not slot — otherwise a scroll reuses a row
       *  instance for a different result and re-parses/reruns its subtree. */
      const rowKey = message?.messageId ?? key;
      return (
        <MeasuredRow
          key={rowKey}
          cache={cache}
          rowKey={rowKey}
          parent={parent as MeasuredCellParent}
          index={index}
          style={style}
        >
          <SearchMessage message={message} />
        </MeasuredRow>
      );
    },
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

  const loadingSpinner = (
    <div className="absolute inset-0 flex items-center justify-center">
      <Spinner className="text-text-primary" />
    </div>
  );

  if (!searchQuery) {
    /** A fresh query is typed but its debounce hasn't fired yet: show loading
     *  rather than a blank route during that first delay. */
    return search.query && search.isTyping ? loadingSpinner : null;
  }

  const hasResults = resultsCount > 0;

  /** Only the FIRST load (no results yet) shows the full-screen spinner.
   *  `keepPreviousData` on the query keeps prior results mounted across query
   *  changes, so typing no longer unmounts + re-parses the whole list. */
  if ((isLoading || search.isTyping) && !hasResults) {
    return loadingSpinner;
  }

  if (!hasResults) {
    return (
      <>
        <div className="sr-only" role="alert" aria-atomic="true">
          {resultsAnnouncement}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-white p-6 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
            {localize('com_ui_nothing_found')}
          </div>
        </div>
      </>
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
          overscanRowCount={10}
          aria-label={localize('com_nav_search_placeholder')}
          className={cn('outline-none', search.isTyping && 'opacity-70')}
          style={{ outline: 'none' }}
        />
      </div>
      {isFetchingNextPage && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center py-4">
          <Spinner className="text-text-primary" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[5%] bg-gradient-to-t from-gray-50 to-transparent dark:from-gray-800" />
    </div>
  );
}
