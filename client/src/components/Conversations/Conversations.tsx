import { useMemo, memo, type FC, useCallback } from 'react';
import { throttle } from 'lodash';
import { parseISO, isToday } from 'date-fns';
import { List, AutoSizer, CellMeasurer, CellMeasurerCache } from 'react-virtualized';
import { TConversation } from 'librechat-data-provider';
import { useLocalize, TranslationKeys } from '~/hooks';
import { groupConversationsByDate } from '~/utils';
import { Spinner } from '~/components/svg';
import Convo from './Convo';

interface ConversationsProps {
  conversations: Array<TConversation | null>;
  moveToTop: () => void;
  toggleNav: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  loadMoreConversations: () => void;
  isFetchingNextPage: boolean;
}

const LoadingSpinner = memo(() => (
  <div className="flex justify-center py-2">
    <Spinner className="m-1 h-4 w-4 text-text-primary" />
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

const DateLabel: FC<{ groupName: string }> = memo(({ groupName }) => {
  const localize = useLocalize();
  return (
    <div className="pl-2 pt-1 text-text-secondary" style={{ fontSize: '0.7rem' }}>
      {localize(groupName as TranslationKeys) || groupName}
    </div>
  );
});
DateLabel.displayName = 'DateLabel';

type FlattenedItem =
  | { type: 'header'; groupName: string }
  | { type: 'convo'; convo: TConversation }
  | { type: 'spinner' };

const Conversations: FC<ConversationsProps> = ({
  conversations: rawConversations,
  moveToTop,
  toggleNav,
  containerRef,
  loadMoreConversations,
  isFetchingNextPage,
}) => {
  const filteredConversations = useMemo(
    () => rawConversations.filter(Boolean) as TConversation[],
    [rawConversations],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations],
  );

  const firstTodayConvoId = useMemo(
    () =>
      filteredConversations.find((convo) => convo.updatedAt && isToday(parseISO(convo.updatedAt)))
        ?.conversationId ?? undefined,
    [filteredConversations],
  );

  const flattenedItems = useMemo(() => {
    const items: FlattenedItem[] = [];
    groupedConversations.forEach(([groupName, convos]) => {
      items.push({ type: 'header', groupName });
      items.push(...convos.map((convo) => ({ type: 'convo' as const, convo })));
    });
    if (isFetchingNextPage) {
      items.push({ type: 'spinner' });
    }
    return items;
  }, [groupedConversations, isFetchingNextPage]);

  const cache = useMemo(
    () =>
      new CellMeasurerCache({
        fixedWidth: true,
        defaultHeight: 34,
        keyMapper: (index) => {
          const item = flattenedItems[index];
          if (item.type === 'header') {
            return `header-${index}`;
          }
          if (item.type === 'spinner') {
            return 'spinner';
          }
          return `convo-${item.convo.conversationId}`;
        },
      }),
    [flattenedItems],
  );

  const rowRenderer = useCallback(
    ({ index, key, parent, style }) => {
      const item = flattenedItems[index];

      const renderContent = () => {
        switch (item.type) {
          case 'header':
            return <DateLabel groupName={item.groupName} />;
          case 'spinner':
            return <LoadingSpinner />;
          case 'convo':
            return (
              <Convo
                conversation={item.convo}
                retainView={moveToTop}
                toggleNav={toggleNav}
                isLatestConvo={item.convo.conversationId === firstTodayConvoId}
              />
            );
          default:
            return null;
        }
      };

      return (
        <CellMeasurer cache={cache} columnIndex={0} key={key} parent={parent} rowIndex={index}>
          {({ registerChild }) => (
            <div ref={registerChild} style={style}>
              <div className={item.type === 'convo' ? 'mb-1' : undefined}>{renderContent()}</div>
            </div>
          )}
        </CellMeasurer>
      );
    },
    [cache, flattenedItems, firstTodayConvoId, moveToTop, toggleNav],
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
      if (stopIndex >= flattenedItems.length - 2) {
        throttledLoadMore();
      }
    },
    [flattenedItems.length, throttledLoadMore],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col pb-2 text-sm text-text-primary"
    >
      <div className="flex-1">
        <AutoSizer>
          {({ width, height }) => (
            <List
              width={width}
              height={height}
              deferredMeasurementCache={cache}
              rowCount={flattenedItems.length}
              rowHeight={getRowHeight}
              rowRenderer={rowRenderer}
              overscanRowCount={10}
              className="outline-none"
              style={{ outline: 'none' }}
              role="list"
              aria-label="Conversations"
              onRowsRendered={handleRowsRendered}
            />
          )}
        </AutoSizer>
      </div>
    </div>
  );
};

export default memo(Conversations);
