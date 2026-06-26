import { useMemo, memo, type FC, useCallback, useEffect, useRef } from 'react';
import throttle from 'lodash/throttle';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { List, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import { Spinner, TooltipAnchor, NewChatIcon, useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import {
  useLocalize,
  TranslationKeys,
  useFavorites,
  useShowMarketplace,
  useNewConvo,
  useElementSize,
} from '~/hooks';
import { groupConversationsByDate, clearMessagesCache, cn } from '~/utils';
import FavoritesList from '~/components/Nav/Favorites/FavoritesList';
import { useActiveJobs } from '~/data-provider';
import Convo from './Convo';
import store from '~/store';

export type CellPosition = {
  columnIndex: number;
  rowIndex: number;
};

export type MeasuredCellParent = {
  invalidateCellSizeAfterRender?: ((cell: CellPosition) => void) | undefined;
  recomputeGridSize?: ((cell: CellPosition) => void) | undefined;
};

interface ConversationsProps {
  conversations: Array<TConversation | null>;
  moveToTop: () => void;
  toggleNav: () => void;
  containerRef: React.RefObject<List>;
  loadMoreConversations: () => void;
  isLoading: boolean;
  isSearchLoading: boolean;
  isChatsExpanded: boolean;
  setIsChatsExpanded: (expanded: boolean) => void;
  showFavorites?: boolean;
}

interface MeasuredRowProps {
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}

/** Reusable wrapper for virtualized row measurement */
const MeasuredRow: FC<MeasuredRowProps> = memo(
  ({ cache, rowKey, parent, index, style, children }) => (
    <CellMeasurer cache={cache} columnIndex={0} key={rowKey} parent={parent} rowIndex={index}>
      {({ registerChild }) => (
        <div ref={registerChild as React.LegacyRef<HTMLDivElement>} style={style} className="px-3">
          {children}
        </div>
      )}
    </CellMeasurer>
  ),
);

MeasuredRow.displayName = 'MeasuredRow';

const LoadingSpinner = memo(() => {
  const localize = useLocalize();

  return (
    <div className="mx-auto mt-2 flex items-center justify-center gap-2">
      <Spinner className="text-text-primary" />
      <span className="animate-pulse text-text-primary">{localize('com_ui_loading')}</span>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

interface ChatsHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const headerIconButtonClassName =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-active-alt hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

/** Collapsible header for the Chats section */
const ChatsHeader: FC<ChatsHeaderProps> = memo(({ isExpanded, onToggle }) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const handleNewChat = useCallback(() => {
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  }, [conversation?.conversationId, newConversation, queryClient]);

  return (
    <div className="flex h-8 w-full items-center gap-0.5 pr-2">
      <button
        onClick={onToggle}
        className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
        aria-expanded={isExpanded}
      >
        <span className="select-none truncate">{localize('com_ui_chats')}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200',
            isExpanded ? '' : '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>
      <TooltipAnchor
        description={localize('com_ui_new_chat')}
        render={
          <button
            type="button"
            aria-label={localize('com_ui_new_chat')}
            className={headerIconButtonClassName}
            onClick={handleNewChat}
          >
            <NewChatIcon className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
});

ChatsHeader.displayName = 'ChatsHeader';

const PinnedHeader: FC = memo(() => {
  const localize = useLocalize();
  return (
    <h2 className="pl-1 pt-1 text-text-secondary" style={{ fontSize: '0.7rem' }}>
      {localize('com_ui_pinned')}
    </h2>
  );
});

PinnedHeader.displayName = 'PinnedHeader';

const DateLabel: FC<{ groupName: string; isFirst?: boolean }> = memo(({ groupName, isFirst }) => {
  const localize = useLocalize();
  return (
    <h2
      aria-label={localize('com_a11y_chats_date_section', {
        date: localize(groupName as TranslationKeys) || groupName,
      })}
      className={cn('pl-1 pt-1 text-text-secondary', isFirst === true ? 'mt-0' : 'mt-2')}
      style={{ fontSize: '0.7rem' }}
    >
      {localize(groupName as TranslationKeys) || groupName}
    </h2>
  );
});

DateLabel.displayName = 'DateLabel';

type FlattenedItem =
  | { type: 'favorites' }
  | { type: 'pinned-header' }
  | { type: 'pinned-convo'; convo: TConversation }
  | { type: 'header'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'loading' };

const Conversations: FC<ConversationsProps> = ({
  conversations: rawConversations,
  moveToTop,
  toggleNav,
  containerRef,
  loadMoreConversations,
  isLoading,
  isSearchLoading,
  isChatsExpanded,
  setIsChatsExpanded,
  showFavorites = true,
}) => {
  const localize = useLocalize();
  const search = useRecoilValue(store.search);
  const { favorites, isLoading: isFavoritesLoading } = useFavorites();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const convoHeight = isSmallScreen ? 44 : 34;
  const showAgentMarketplace = useShowMarketplace();
  const {
    ref: listContainerRef,
    width: listWidth,
    height: listHeight,
  } = useElementSize<HTMLDivElement>();

  const favoritesContentKeyRef = useRef('');

  // Fetch active job IDs for showing generation indicators
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  // Determine if FavoritesList will render content
  const shouldShowFavorites =
    showFavorites &&
    !search.query &&
    (isFavoritesLoading || favorites.length > 0 || showAgentMarketplace);

  favoritesContentKeyRef.current = `${favorites.length}-${showAgentMarketplace ? 1 : 0}-${isFavoritesLoading ? 1 : 0}`;

  const filteredConversations = useMemo(
    () => rawConversations.filter(Boolean) as TConversation[],
    [rawConversations],
  );

  const pinnedConversations = useMemo(
    () => filteredConversations.filter((c) => c.pinned),
    [filteredConversations],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations],
  );

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = [];
    // Only include favorites row if FavoritesList will render content
    if (shouldShowFavorites) {
      items.push({ type: 'favorites' });
    }

    if (isChatsExpanded) {
      if (!search.query && pinnedConversations.length > 0) {
        items.push({ type: 'pinned-header' });
        items.push(
          ...pinnedConversations.map((convo) => ({ type: 'pinned-convo' as const, convo })),
        );
      }

      groupedConversations.forEach(([groupName, convos]) => {
        items.push({ type: 'header', groupName });
        items.push(...convos.map((convo) => ({ type: 'convo' as const, convo })));
      });

      if (isLoading) {
        items.push({ type: 'loading' } as any);
      }
    }
    return items;
  }, [
    groupedConversations,
    pinnedConversations,
    isLoading,
    isChatsExpanded,
    shouldShowFavorites,
    search.query,
  ]);

  // Store flattenedItems in a ref for keyMapper to access without recreating cache
  const flattenedItemsRef = useRef(flattenedItems);
  flattenedItemsRef.current = flattenedItems;

  // Create a stable cache that doesn't depend on flattenedItems
  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: convoHeight,
        keyMapper: (index) => {
          const item = flattenedItemsRef.current[index];
          if (!item) {
            return `unknown-${index}`;
          }
          if (item.type === 'favorites') {
            return `favorites-${favoritesContentKeyRef.current}`;
          }
          if (item.type === 'pinned-header') {
            return 'pinned-header';
          }
          if (item.type === 'pinned-convo') {
            return `pinned-${item.convo.conversationId}`;
          }
          if (item.type === 'header') {
            const firstHeaderIndex = flattenedItemsRef.current[0]?.type === 'favorites' ? 1 : 0;
            return `header-${item.groupName}-${index === firstHeaderIndex ? 'first' : 'sub'}`;
          }
          if (item.type === 'convo') {
            return `convo-${item.convo.conversationId}`;
          }
          if (item.type === 'loading') {
            return 'loading';
          }
          return `unknown-${index}`;
        },
      }),
    [convoHeight],
  );

  const clearFavoritesCache = useCallback(() => {
    if (cache) {
      cache.clear(0, 0);
      if (containerRef.current && 'recomputeRowHeights' in containerRef.current) {
        containerRef.current.recomputeRowHeights(0);
      }
    }
  }, [cache, containerRef]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      clearFavoritesCache();
    });
    return () => cancelAnimationFrame(frameId);
  }, [favorites.length, isFavoritesLoading, showAgentMarketplace, clearFavoritesCache]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      cache.clearAll();
      if (containerRef.current && 'recomputeRowHeights' in containerRef.current) {
        containerRef.current.recomputeRowHeights(0);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [search.query, cache, containerRef]);

  /** Grid only re-derives row offsets when the row count changes; reorders that
   *  keep the count (e.g. a convo bumped across date groups) need an explicit recompute. */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (containerRef.current && 'recomputeRowHeights' in containerRef.current) {
        containerRef.current.recomputeRowHeights(0);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [flattenedItems, containerRef]);

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];
      const rowProps = { cache, rowKey: key, parent, index, style };

      if (item.type === 'loading') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <LoadingSpinner />
          </MeasuredRow>
        );
      }

      if (item.type === 'favorites') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <FavoritesList isSmallScreen={isSmallScreen} toggleNav={toggleNav} />
          </MeasuredRow>
        );
      }

      if (item.type === 'pinned-header') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <PinnedHeader />
          </MeasuredRow>
        );
      }

      if (item.type === 'pinned-convo') {
        const isGenerating = activeJobIds.has(item.convo.conversationId ?? '');
        return (
          <MeasuredRow key={key} {...rowProps}>
            <Convo
              conversation={item.convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              isGenerating={isGenerating}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'header') {
        // First date header index depends on favorites row, pinned header, and pinned convos
        // At most: [favorites, pinned-header, # pinned-convos] → first-header
        const pinnedOffset = pinnedConversations.length > 0 ? pinnedConversations.length + 1 : 0;
        const firstHeaderIndex = (flattenedItems[0]?.type === 'favorites' ? 1 : 0) + pinnedOffset;
        return (
          <MeasuredRow key={key} {...rowProps}>
            <DateLabel groupName={item.groupName} isFirst={index === firstHeaderIndex} />
          </MeasuredRow>
        );
      }

      if (item.type === 'convo') {
        const isGenerating = activeJobIds.has(item.convo.conversationId ?? '');
        return (
          <MeasuredRow key={key} {...rowProps}>
            <Convo
              conversation={item.convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              isGenerating={isGenerating}
            />
          </MeasuredRow>
        );
      }

      return null;
    },
    [cache, flattenedItems, moveToTop, toggleNav, isSmallScreen, pinnedConversations, activeJobIds],
  );

  const getRowHeight = useCallback(
    ({ index }: { index: number }) => cache.getHeight(index, 0),
    [cache],
  );

  const throttledLoadMore = useMemo(
    () => throttle(loadMoreConversations, 300),
    [loadMoreConversations],
  );

  const handleRowsRendered = useCallback(
    ({ stopIndex }: { stopIndex: number }) => {
      if (stopIndex >= flattenedItems.length - 8) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, throttledLoadMore],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col pb-2 text-sm text-text-primary">
      <div className="px-3">
        <ChatsHeader
          isExpanded={isChatsExpanded}
          onToggle={() => setIsChatsExpanded(!isChatsExpanded)}
        />
      </div>
      {isSearchLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-text-primary" />
          <span className="ml-2 text-text-primary">{localize('com_ui_loading')}</span>
        </div>
      ) : (
        <div ref={listContainerRef} className="min-h-0 flex-1 overflow-hidden">
          <List
            ref={containerRef}
            width={listWidth}
            height={listHeight}
            deferredMeasurementCache={cache}
            rowCount={flattenedItems.length}
            rowHeight={getRowHeight}
            rowRenderer={rowRenderer}
            overscanRowCount={10}
            aria-readonly={false}
            className="outline-none"
            aria-label="Conversations"
            onRowsRendered={handleRowsRendered}
            tabIndex={-1}
            style={{ outline: 'none' }}
            containerRole="rowgroup"
          />
        </div>
      )}
    </div>
  );
};

export { DateLabel };
export default memo(Conversations);
