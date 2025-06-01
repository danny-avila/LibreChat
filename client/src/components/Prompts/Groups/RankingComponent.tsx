import React, { useCallback, useEffect, useState, useRef, ReactNode } from 'react';
import { DndProvider, useDrag, useDrop, useDragLayer } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { GripVertical } from 'lucide-react';
import { useUpdatePromptRankings, useGetUserPromptPreferences } from '~/data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
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
}

function DraggablePromptItem({
  group,
  index,
  moveItem,
  isDragging: isAnyDragging,
  children,
}: DraggablePromptItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  const [{ isDragging }, drag, preview] = useDrag({
    type: ITEM_TYPE,
    item: () => ({ type: ITEM_TYPE, index, id: group._id }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOverCurrent }, drop] = useDrop<DragItem, void, { isOverCurrent: boolean }>({
    accept: ITEM_TYPE,
    hover: (item, monitor) => {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY * 0.8) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY * 1.2) return;

      moveItem(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOverCurrent: monitor.isOver({ shallow: true }),
    }),
  });

  useEffect(() => {
    setIsOver(isOverCurrent);
  }, [isOverCurrent]);

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
      style={{
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <div
        className={cn(
          'absolute left-2 top-1/2 z-10 -translate-y-1/2 transition-all duration-200',
          'opacity-0 group-hover:opacity-100',
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
  const { item, itemType, currentOffset, isDragging } = useDragLayer((monitor) => ({
    item: monitor.getItem(),
    itemType: monitor.getItemType(),
    currentOffset: monitor.getSourceClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!isDragging || !currentOffset || itemType !== ITEM_TYPE) {
    return null;
  }

  const renderPreview = () => {
    if (item && typeof item.id === 'string') {
      return (
        <div
          style={{
            backgroundColor: 'rgba(230, 245, 255, 0.9)',
            padding: '10px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'inline-block',
          }}
        >
          {`Moving: ${item.id}`}
        </div>
      );
    }
    return <div>Dragging...</div>;
  };

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
        {renderPreview()}
      </div>
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
    const rankingMap = new Map(rankings.map((ranking) => [ranking.promptGroupId, ranking.order]));

    const sorted = [...groups].sort((a, b) => {
      const aId = a._id ?? '';
      const bId = b._id ?? '';
      const aIsFavorite = favorites.includes(aId);
      const bIsFavorite = favorites.includes(bId);

      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;

      const aRank = rankingMap.get(aId);
      const bRank = rankingMap.get(bId);
      if (aRank !== undefined && bRank !== undefined) {
        return aRank - bRank;
      }
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;

      return a.name.localeCompare(b.name);
    });

    setSortedGroups(sorted);
  }, [groups, preferences]);

  const moveItem = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      if (dragIndex === hoverIndex) return;
      setSortedGroups((prevGroups) => {
        const newGroups = [...prevGroups];
        const draggedItem = newGroups[dragIndex];
        newGroups.splice(dragIndex, 1);
        newGroups.splice(hoverIndex, 0, draggedItem);
        return newGroups;
      });

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setSortedGroups((currentGroups) => {
          const newRankings = currentGroups
            .map((group, index) =>
              typeof group._id === 'string' ? { promptGroupId: group._id, order: index } : null,
            )
            .filter(
              (ranking): ranking is { promptGroupId: string; order: number } => ranking !== null,
            );

          if (newRankings.length > 0) {
            updateRankings
              .mutateAsync({ rankings: newRankings })
              .then(() => {
                onRankingChange?.(newRankings.map((r) => r.promptGroupId));
              })
              .catch((error) => {
                console.error('Failed to update rankings:', error);
              });
          }
          return currentGroups;
        });
      }, 500);
    },
    [updateRankings, onRankingChange],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => setIsDragging(false);

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  return (
    <div className={cn('space-y-2 transition-all duration-300', isDragging && 'space-y-3')}>
      {sortedGroups.map((group, index) => (
        <div
          key={group._id || index}
          className="transition-all duration-300 ease-in-out"
          style={{
            transform: `translateY(${isDragging ? '2px' : '0'})`,
          }}
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
    <DndProvider backend={HTML5Backend}>
      <CustomDragLayer />
      {children}
    </DndProvider>
  );
}

export { RankablePromptList, RankingProvider };
