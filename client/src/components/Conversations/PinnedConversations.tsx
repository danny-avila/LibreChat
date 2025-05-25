import { useCallback, memo, useState, useEffect, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { TConversation } from 'librechat-data-provider';
import { useReorderPinnedConversationsMutation } from '~/data-provider';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import Convo from './Convo';

interface DragItem {
  index: number;
  id: string;
  type: string;
}

interface SortableConvoProps {
  conversation: TConversation;
  toggleNav: () => void;
  index: number;
  moveConvo: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: () => void;
}

const SortableConvo = memo(
  ({ conversation, toggleNav, index, moveConvo, onDragEnd }: SortableConvoProps) => {
    const ref = useRef<HTMLDivElement>(null);

    const [, drop] = useDrop({
      accept: 'pinned-conversation',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      drop: (item: DragItem) => {
        // This is called when the drag operation completes
        // The actual reordering happens in hover, this is for final API call
        return { dropEffect: 'move' };
      },
      hover(item: DragItem, monitor) {
        if (!ref.current || item.index === index) {
          return;
        }

        // Hysteresis logic to prevent drag flickering
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;

        // Only reorder when cursor crosses the middle of the target item

        // Dragging downwards
        if (item.index < index && hoverClientY < hoverMiddleY) {
          return;
        }

        // Dragging upwards
        if (item.index > index && hoverClientY > hoverMiddleY) {
          return;
        }

        moveConvo(item.index, index);
        item.index = index;
      },
    });

    const [{ isDragging }, drag] = useDrag({
      type: 'pinned-conversation',
      item: { index, id: conversation.conversationId },
      end: () => {
        // Call API to persist the new order when drag ends
        onDragEnd();
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    drag(drop(ref));

    return (
      <div
        ref={ref}
        className={`group relative cursor-grab active:cursor-grabbing ${isDragging ? 'rounded-md border border-border-light bg-surface-primary opacity-30 shadow-lg' : ''}`}
        style={{ opacity: isDragging ? 0.3 : 1 }}
      >
        <Convo
          conversation={conversation}
          retainView={() => {}}
          toggleNav={toggleNav}
          isLatestConvo={false}
        />
      </div>
    );
  },
);

SortableConvo.displayName = 'SortableConvo';

interface PinnedConversationsProps {
  pinnedConversations: TConversation[];
  toggleNav: () => void;
}

const PinnedConversations = memo(({ pinnedConversations, toggleNav }: PinnedConversationsProps) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const reorderMutation = useReorderPinnedConversationsMutation();

  // Local state to track the current order during drag operations
  const [localPinnedOrder, setLocalPinnedOrder] = useState<TConversation[]>([]);

  // Sync local state with props when pinnedConversations changes
  useEffect(() => {
    setLocalPinnedOrder(pinnedConversations);
  }, [pinnedConversations]);

  const moveConvo = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const draggedItem = localPinnedOrder[dragIndex];
      const newOrder = [...localPinnedOrder];
      newOrder.splice(dragIndex, 1);
      newOrder.splice(hoverIndex, 0, draggedItem);
      setLocalPinnedOrder(newOrder);
    },
    [localPinnedOrder],
  );

  const handleDrop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (dragIndex: number) => {
      // Get the new order for the API
      const conversationIds = localPinnedOrder
        .map((convo) => convo.conversationId)
        .filter((id): id is string => Boolean(id));

      // Call the mutation
      reorderMutation.mutate(
        { conversationIds },
        {
          onError: () => {
            // Revert local state on error
            setLocalPinnedOrder(pinnedConversations);
            showToast({
              message: localize('com_ui_reorder_error') || 'Failed to reorder conversations',
              status: 'error',
            });
          },
        },
      );
    },
    [localPinnedOrder, pinnedConversations, reorderMutation, showToast, localize],
  );

  if (localPinnedOrder.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Header */}
      <div className="mt-2 pl-2 pt-1 text-text-secondary" style={{ fontSize: '0.7rem' }}>
        {localize('com_ui_pinned')}
      </div>

      {/* Sortable list */}
      {localPinnedOrder.map((conversation, index) => (
        <SortableConvo
          key={conversation.conversationId}
          index={index}
          conversation={conversation}
          toggleNav={toggleNav}
          moveConvo={moveConvo}
          onDragEnd={() => handleDrop(index)}
        />
      ))}
    </div>
  );
});

PinnedConversations.displayName = 'PinnedConversations';

export default PinnedConversations;
