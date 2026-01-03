import { useMemo, memo, type FC, useCallback, useEffect, useRef } from 'react';
import throttle from 'lodash/throttle';
import { ChevronDown, Share2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner, useMediaQuery } from '@librechat/client';
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import { useGetSharedConversationsQuery } from 'librechat-data-provider/react-query';
import type { TConversation, SharedConversationListItem } from 'librechat-data-provider';
import { useLocalize, TranslationKeys, useFavorites, useShowMarketplace } from '~/hooks';
import FavoritesList from '~/components/Nav/Favorites/FavoritesList';
import { useActiveJobs } from '~/data-provider';
import { groupConversationsByDate, cn } from '~/utils';
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
        <div ref={registerChild as React.LegacyRef<HTMLDivElement>} style={style}>
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

/** Collapsible header for the Chats section */
const ChatsHeader: FC<ChatsHeaderProps> = memo(({ isExpanded, onToggle }) => {
  const localize = useLocalize();
  return (
    <button
      onClick={onToggle}
      className="group flex w-full items-center justify-between px-1 py-2 text-xs font-bold text-text-secondary"
      type="button"
    >
      <span className="select-none">{localize('com_ui_chats')}</span>
      <ChevronDown
        className={cn('h-3 w-3 transition-transform duration-200', isExpanded ? 'rotate-180' : '')}
      />
    </button>
  );
});

ChatsHeader.displayName = 'ChatsHeader';

const DateLabel: FC<{ groupName: string; isFirst?: boolean }> = memo(({ groupName, isFirst }) => {
  const localize = useLocalize();
  return (
    <h2
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
  | { type: 'chats-header' }
  | { type: 'header'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'shared-header' }
  | { type: 'shared-convo'; convo: SharedConversationListItem }
  | { type: 'loading' };

interface SharedConvoItemProps {
  convo: SharedConversationListItem;
  isActive: boolean;
  onClick: () => void;
  toggleNav: () => void;
  isSmallScreen: boolean;
}

const SharedConvoItem = memo(({ convo, isActive, onClick, isSmallScreen }: SharedConvoItemProps) => {
  const localize = useLocalize();

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-2 rounded-lg text-left text-sm transition-colors',
        isSmallScreen ? 'px-2 py-2.5' : 'px-2 py-1.5',
        isActive
          ? 'bg-surface-active text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover',
      )}
    >
      <Share2 className="size-4 shrink-0 text-green-500" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{convo.title || 'Untitled'}</span>
        {convo.ownerName && (
          <span className={cn(
            'truncate text-xs',
            isActive ? 'text-text-secondary' : 'text-text-tertiary',
          )}>
            {localize('com_ui_shared_by', { name: convo.ownerName })}
          </span>
        )}
      </div>
    </button>
  );
});

SharedConvoItem.displayName = 'SharedConvoItem';

/** Header for shared conversations section */
const SharedHeader: FC = memo(() => {
  const localize = useLocalize();
  return (
    <div className="mt-3 flex items-center gap-1.5 px-1 py-1 text-xs text-text-tertiary">
      <Share2 className="size-3 text-green-500" />
      <span>{localize('com_ui_shared_conversations')}</span>
    </div>
  );
});

SharedHeader.displayName = 'SharedHeader';

const MemoizedConvo = memo(
  ({
    conversation,
    retainView,
    toggleNav,
    isGenerating,
  }: {
    conversation: TConversation;
    retainView: () => void;
    toggleNav: () => void;
    isGenerating: boolean;
  }) => {
    return (
      <Convo
        conversation={conversation}
        retainView={retainView}
        toggleNav={toggleNav}
        isGenerating={isGenerating}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.conversation.conversationId === nextProps.conversation.conversationId &&
      prevProps.conversation.title === nextProps.conversation.title &&
      prevProps.conversation.endpoint === nextProps.conversation.endpoint &&
      prevProps.isGenerating === nextProps.isGenerating
    );
  },
);

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
}) => {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const search = useRecoilValue(store.search);
  const resumableEnabled = useRecoilValue(store.resumableStreams);
  const { favorites, isLoading: isFavoritesLoading } = useFavorites();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const convoHeight = isSmallScreen ? 44 : 34;
  const showAgentMarketplace = useShowMarketplace();

  // Fetch shared conversations
  const { data: sharedData } = useGetSharedConversationsQuery(
    { pageSize: 25 },
    { staleTime: 60000 },
  );

  // Filter shared conversations based on search query
  const filteredSharedConversations = useMemo(() => {
    const shares = sharedData?.shares || [];
    if (!search.debouncedQuery) {
      return shares;
    }
    const query = search.debouncedQuery.toLowerCase();
    return shares.filter(
      (share) =>
        share.title?.toLowerCase().includes(query) ||
        share.ownerName?.toLowerCase().includes(query),
    );
  }, [sharedData?.shares, search.debouncedQuery]);

  // Fetch active job IDs for showing generation indicators
  const { data: activeJobsData } = useActiveJobs(resumableEnabled);
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  // Determine if FavoritesList will render content
  const shouldShowFavorites =
    !search.query && (isFavoritesLoading || favorites.length > 0 || showAgentMarketplace);

  const filteredConversations = useMemo(
    () => rawConversations.filter(Boolean) as TConversation[],
    [rawConversations],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations],
  );

  const handleSharedConvoClick = useCallback(
    (convoId: string) => {
      navigate(`/c/${convoId}?shared=true`);
      toggleNav();
    },
    [navigate, toggleNav],
  );

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = [];
    // Only include favorites row if FavoritesList will render content
    if (shouldShowFavorites) {
      items.push({ type: 'favorites' });
    }
    items.push({ type: 'chats-header' });

    if (isChatsExpanded) {
      // Add shared conversations section first (above Today) if there are any
      if (filteredSharedConversations.length > 0) {
        items.push({ type: 'shared-header' });
        items.push(
          ...filteredSharedConversations.map((convo) => ({
            type: 'shared-convo' as const,
            convo,
          })),
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
  }, [groupedConversations, isLoading, isChatsExpanded, shouldShowFavorites, filteredSharedConversations]);

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
            return 'favorites';
          }
          if (item.type === 'chats-header') {
            return 'chats-header';
          }
          if (item.type === 'header') {
            return `header-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `convo-${item.convo.conversationId}`;
          }
          if (item.type === 'shared-header') {
            return 'shared-header';
          }
          if (item.type === 'shared-convo') {
            return `shared-convo-${item.convo.conversationId}`;
          }
          if (item.type === 'loading') {
            return 'loading';
          }
          return `unknown-${index}`;
        },
      }),
    [convoHeight],
  );

  // Debounced function to clear cache and recompute heights
  const clearFavoritesCache = useCallback(() => {
    if (cache) {
      cache.clear(0, 0);
      if (containerRef.current && 'recomputeRowHeights' in containerRef.current) {
        containerRef.current.recomputeRowHeights(0);
      }
    }
  }, [cache, containerRef]);

  // Clear cache when favorites change
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      clearFavoritesCache();
    });
    return () => cancelAnimationFrame(frameId);
  }, [favorites.length, isFavoritesLoading, clearFavoritesCache]);

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
            <FavoritesList
              isSmallScreen={isSmallScreen}
              toggleNav={toggleNav}
              onHeightChange={clearFavoritesCache}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'chats-header') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <ChatsHeader
              isExpanded={isChatsExpanded}
              onToggle={() => setIsChatsExpanded(!isChatsExpanded)}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'header') {
        // First date header index depends on whether favorites row is included
        // With favorites: [favorites, chats-header, first-header] → index 2
        // Without favorites: [chats-header, first-header] → index 1
        const firstHeaderIndex = shouldShowFavorites ? 2 : 1;
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
            <MemoizedConvo
              conversation={item.convo}
              retainView={moveToTop}
              toggleNav={toggleNav}
              isGenerating={isGenerating}
            />
          </MeasuredRow>
        );
      }

      if (item.type === 'shared-header') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <SharedHeader />
          </MeasuredRow>
        );
      }

      if (item.type === 'shared-convo') {
        const isActive = conversationId === item.convo.conversationId;
        return (
          <MeasuredRow key={key} {...rowProps}>
            <SharedConvoItem
              convo={item.convo}
              isActive={isActive}
              onClick={() => handleSharedConvoClick(item.convo.conversationId)}
              toggleNav={toggleNav}
              isSmallScreen={isSmallScreen}
            />
          </MeasuredRow>
        );
      }

      return null;
    },
    [
      cache,
      flattenedItems,
      moveToTop,
      toggleNav,
      clearFavoritesCache,
      isSmallScreen,
      isChatsExpanded,
      setIsChatsExpanded,
      shouldShowFavorites,
      activeJobIds,
      conversationId,
      handleSharedConvoClick,
    ],
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
      {isSearchLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-text-primary" />
          <span className="ml-2 text-text-primary">{localize('com_ui_loading')}</span>
        </div>
      ) : (
        <div className="flex-1">
          <AutoSizer>
            {({ width, height }) => (
              <List
                ref={containerRef}
                width={width}
                height={height}
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
                style={{ outline: 'none', scrollbarGutter: 'stable' }}
              />
            )}
          </AutoSizer>
        </div>
      )}
    </div>
  );
};

export default memo(Conversations);
