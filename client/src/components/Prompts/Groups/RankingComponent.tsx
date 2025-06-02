import React, { useCallback, useEffect, useState, useRef, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useDrag, useDrop, useDragLayer } from 'react-dnd';
import type { TPromptGroup } from 'librechat-data-provider';
import { useUpdatePromptRankings, useGetUserPromptPreferences } from '~/data-provider';
import CategoryIcon from './CategoryIcon';
import { Label } from '~/components';
import { cn } from '~/utils';

const ITEM_TYPE = 'PROMPT_GROUP';

interface DraggablePromptItemProps {
  group: TPromptGroup;
  index: number;
  moveItem: (dragIndex: number, hoverIndex: number) => void;
  isDragging: boolean;
  children: ReactNode;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
  group: TPromptGroup;
}

const sortGroups = (groups: TPromptGroup[], rankings: any[], favorites: string[]) => {
  const rankingMap = new Map(rankings.map((ranking) => [ranking.promptGroupId, ranking.order]));

  return [...groups].sort((a, b) => {
    const aId = a._id ?? '';
    const bId = b._id ?? '';
    const aIsFavorite = favorites.includes(aId);
    const bIsFavorite = favorites.includes(bId);

    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;

    const aRank = rankingMap.get(aId);
    const bRank = rankingMap.get(bId);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;

    return a.name.localeCompare(b.name);
  });
};

function DraggablePromptItem({
  group,
  index,
  moveItem,
  isDragging: isAnyDragging,
  children,
}: DraggablePromptItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: { type: ITEM_TYPE, index, id: group._id, group },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: ITEM_TYPE,
    hover: (item, monitor) => {
      if (!ref.current || item.index === index) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = hoverBoundingRect.height / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (item.index < index && hoverClientY < hoverMiddleY * 0.8) return;
      if (item.index > index && hoverClientY > hoverMiddleY * 1.2) return;

      moveItem(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
  });

  drag(drop(ref));

  useEffect(() => {
    preview(new Image(), { captureDraggingState: false });
  }, [preview]);

  return (
    <div
      ref={ref}
      className={cn(
        'group relative transition-all duration-300 ease-in-out',
        isDragging && 'opacity-0',
        isAnyDragging && !isDragging && 'transition-transform',
        isOver && !isDragging && 'scale-[1.02]',
      )}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <div
        className={cn(
          'absolute left-2 top-1/2 z-10 -translate-y-1/2 opacity-0 group-hover:opacity-100',
          isDragging && 'opacity-100',
        )}
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>
      <div className="pl-8">{children}</div>
    </div>
  );
}

function CustomDragLayer() {
  const { itemType, item, currentOffset, isDragging } = useDragLayer((monitor) => ({
    itemType: monitor.getItemType(),
    item: monitor.getItem() as DragItem,
    currentOffset: monitor.getSourceClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!isDragging || !currentOffset || itemType !== ITEM_TYPE || !item?.group) return null;

  return (
    <div
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 100,
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <div
        style={{
          transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
        }}
      >
        <div className="mx-2 my-2 flex h-[60px] w-[430px] min-w-[300px] cursor-pointer rounded-lg border border-border-light bg-surface-primary p-3 opacity-90 shadow-lg">
          <div className="flex items-center gap-2 truncate pr-2">
            <CategoryIcon
              category={item.group.category ?? ''}
              className="icon-lg"
              aria-hidden="true"
            />

            <Label className="text-md cursor-pointer truncate font-semibold text-text-primary">
              {item.group.name}
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortedPromptList({
  groups,
  renderItem,
}: {
  groups: TPromptGroup[];
  renderItem: (group: TPromptGroup) => ReactNode;
}) {
  const { data: preferences } = useGetUserPromptPreferences();
  const [sortedGroups, setSortedGroups] = useState<TPromptGroup[]>([]);

  useEffect(() => {
    if (!groups?.length) {
      setSortedGroups([]);
      return;
    }

    const rankings = preferences?.rankings || [];
    const favorites = preferences?.favorites || [];
    setSortedGroups(sortGroups(groups, rankings, favorites));
  }, [groups, preferences]);

  return (
    <div className="space-y-2">
      {sortedGroups.map((group) => (
        <div key={group._id} className="transition-all duration-300 ease-in-out">
          {renderItem(group)}
        </div>
      ))}
    </div>
  );
}

interface RankablePromptListProps {
  groups: TPromptGroup[];
  renderItem: (group: TPromptGroup) => ReactNode;
  onRankingChange?: (rankings: string[]) => void;
}

function RankablePromptList({ groups, renderItem, onRankingChange }: RankablePromptListProps) {
  const { data: preferences } = useGetUserPromptPreferences();
  const updateRankings = useUpdatePromptRankings();
  const [sortedGroups, setSortedGroups] = useState<TPromptGroup[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!groups?.length) {
      setSortedGroups([]);
      return;
    }

    const rankings = preferences?.rankings || [];
    const favorites = preferences?.favorites || [];
    setSortedGroups(sortGroups(groups, rankings, favorites));
  }, [groups, preferences]);

  const moveItem = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      if (dragIndex === hoverIndex) return;

      setSortedGroups((prevGroups) => {
        const newGroups = [...prevGroups];
        const [draggedItem] = newGroups.splice(dragIndex, 1);
        newGroups.splice(hoverIndex, 0, draggedItem);
        return newGroups;
      });

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        setSortedGroups((currentGroups) => {
          const newRankings = currentGroups
            .map((group, index) => (group._id ? { promptGroupId: group._id, order: index } : null))
            .filter(
              (ranking): ranking is { promptGroupId: string; order: number } => ranking !== null,
            );

          if (newRankings.length > 0) {
            updateRankings
              .mutateAsync({ rankings: newRankings })
              .then(() => onRankingChange?.(newRankings.map((r) => r.promptGroupId)))
              .catch(console.error);
          }
          return currentGroups;
        });
      }, 500);
    },
    [updateRankings, onRankingChange],
  );

  useEffect(() => {
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => setIsDragging(false);

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div className={cn('space-y-2 transition-all duration-300', isDragging && 'space-y-3')}>
      {sortedGroups.map((group, index) => (
        <div
          key={group._id || index}
          className="transition-all duration-300 ease-in-out"
          style={{ transform: `translateY(${isDragging ? '2px' : '0'})` }}
        >
          <DraggablePromptItem
            group={group}
            index={index}
            moveItem={moveItem}
            isDragging={isDragging}
          >
            {renderItem(group)}
          </DraggablePromptItem>
        </div>
      ))}
    </div>
  );
}

function RankingProvider({ children }: { children: ReactNode }) {
  return (
    <div>
      <CustomDragLayer />
      {children}
    </div>
  );
}

export { RankablePromptList, SortedPromptList, RankingProvider };
