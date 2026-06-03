import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react';
import throttle from 'lodash/throttle';
import { AutoSizer, CellMeasurer, CellMeasurerCache, List } from 'react-virtualized';
import { Spinner } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import type { MeasuredCellParent } from '~/components/Conversations/Conversations';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { groupConversationsByDate, cn } from '~/utils';
import { DateLabel } from '~/components/Conversations/Conversations';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';

type ChatSortField = 'updatedAt' | 'createdAt';

type FlattenedItem =
  | { type: 'date'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'loading' }
  | { type: 'empty' };

interface ProjectChatListProps {
  conversations: TConversation[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  sortBy: ChatSortField;
  emptyLabel: string;
  loadMore: () => void;
}

interface MeasuredRowProps {
  cache: CellMeasurerCache;
  rowKey: string;
  parent: MeasuredCellParent;
  index: number;
  style: CSSProperties;
  children: ReactNode;
}

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

MeasuredRow.displayName = 'ProjectWorkspaceMeasuredRow';

const LoadingRow = memo(() => {
  const localize = useLocalize();
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-secondary">
      <Spinner className="text-text-primary" />
      <span>{localize('com_ui_loading')}</span>
    </div>
  );
});

LoadingRow.displayName = 'ProjectWorkspaceLoadingRow';

const ConversationRow = memo(({ conversation }: { conversation: TConversation }) => {
  const { navigateToConvo } = useNavigateToConvo();
  const localize = useLocalize();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const title = conversation.title || localize('com_ui_untitled');
  const updatedAt = conversation.updatedAt || conversation.createdAt;
  const formattedDate = updatedAt ? new Date(updatedAt).toLocaleString() : '';

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 border-b border-border-light py-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary"
      onClick={() => navigateToConvo(conversation)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <EndpointIcon
          conversation={conversation}
          endpointsConfig={endpointsConfig ?? {}}
          size={24}
          context="menu-item"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{title}</span>
        <span className="block truncate text-xs text-text-secondary">{formattedDate}</span>
      </span>
    </button>
  );
});

ConversationRow.displayName = 'ProjectWorkspaceConversationRow';

const ProjectChatList = ({
  conversations,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  sortBy,
  emptyLabel,
  loadMore,
}: ProjectChatListProps) => {
  const flattenedItems = useMemo(() => {
    if (isLoading) {
      return [{ type: 'loading' as const }];
    }
    if (!conversations.length) {
      return [{ type: 'empty' as const }];
    }

    const items: FlattenedItem[] = [];
    groupConversationsByDate(conversations, sortBy).forEach(([groupName, convos]) => {
      items.push({ type: 'date', groupName });
      convos.forEach((convo) => items.push({ type: 'convo', convo }));
    });
    if (isFetchingNextPage) {
      items.push({ type: 'loading' });
    }
    return items;
  }, [conversations, isFetchingNextPage, isLoading, sortBy]);

  const flattenedItemsRef = useRef(flattenedItems);
  flattenedItemsRef.current = flattenedItems;

  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: 52,
        keyMapper: (index) => {
          const item = flattenedItemsRef.current[index];
          if (!item) {
            return `project-workspace-unknown-${index}`;
          }
          if (item.type === 'date') {
            return `project-workspace-date-${item.groupName}`;
          }
          if (item.type === 'convo') {
            return `project-workspace-convo-${item.convo.conversationId}`;
          }
          return `project-workspace-${item.type}`;
        },
      }),
    [],
  );

  const listRef = useRef<List | null>(null);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      cache.clearAll();
      listRef.current?.recomputeRowHeights(0);
    });
    return () => cancelAnimationFrame(frameId);
  }, [cache, conversations.length, sortBy]);

  const throttledLoadMore = useMemo(() => throttle(loadMore, 300), [loadMore]);

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];
      const rowProps = { cache, rowKey: key, parent, index, style };

      if (item.type === 'loading') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <LoadingRow />
          </MeasuredRow>
        );
      }

      if (item.type === 'empty') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <div className="py-12 text-center text-sm text-text-secondary">{emptyLabel}</div>
          </MeasuredRow>
        );
      }

      if (item.type === 'date') {
        return (
          <MeasuredRow key={key} {...rowProps}>
            <DateLabel groupName={item.groupName} />
          </MeasuredRow>
        );
      }

      return (
        <MeasuredRow key={key} {...rowProps}>
          <ConversationRow conversation={item.convo} />
        </MeasuredRow>
      );
    },
    [cache, emptyLabel, flattenedItems],
  );

  const getRowHeight = useCallback(
    ({ index }: { index: number }) => cache.getHeight(index, 0),
    [cache],
  );

  const handleRowsRendered = useCallback(
    ({ stopIndex }: { stopIndex: number }) => {
      if (hasNextPage && stopIndex >= flattenedItems.length - 6) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, hasNextPage, throttledLoadMore],
  );

  return (
    <div
      className={cn('min-h-[280px] flex-1 overflow-hidden rounded-lg border border-border-light')}
    >
      <AutoSizer>
        {({ width, height }) => (
          <List
            ref={listRef}
            width={width}
            height={height}
            rowCount={flattenedItems.length}
            rowHeight={getRowHeight}
            rowRenderer={rowRenderer}
            deferredMeasurementCache={cache}
            overscanRowCount={8}
            onRowsRendered={handleRowsRendered}
            className="outline-none"
            style={{ outline: 'none' }}
          />
        )}
      </AutoSizer>
    </div>
  );
};

export default memo(ProjectChatList);
