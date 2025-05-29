import { useCallback, memo, useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TConversation } from 'librechat-data-provider';
import { useReorderPinnedConversationsMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import Convo from './Convo';

interface SortableConvoProps {
  conversation: TConversation;
  toggleNav: () => void;
}

const SortableConvo = memo(({ conversation, toggleNav }: SortableConvoProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: conversation.conversationId || '',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative cursor-grab active:cursor-grabbing ${isDragging ? 'rounded-md border border-border-light bg-surface-primary shadow-lg' : ''}`}
    >
      <Convo
        conversation={conversation}
        retainView={() => {}}
        toggleNav={toggleNav}
        isLatestConvo={false}
      />
    </div>
  );
});

SortableConvo.displayName = 'SortableConvo';

interface PinnedConversationsProps {
  pinnedConversations: TConversation[];
  toggleNav: () => void;
}

const PinnedConversations = memo(({ pinnedConversations, toggleNav }: PinnedConversationsProps) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const reorderMutation = useReorderPinnedConversationsMutation();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Local state to track the current order during drag operations
  const [localPinnedOrder, setLocalPinnedOrder] = useState<TConversation[]>([]);

  // Sync local state with props when pinnedConversations changes
  useEffect(() => {
    setLocalPinnedOrder(pinnedConversations);
  }, [pinnedConversations]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const activeConversation = activeId
    ? localPinnedOrder.find((convo) => convo.conversationId === activeId)
    : null;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = localPinnedOrder.findIndex((convo) => convo.conversationId === active.id);
      const newIndex = localPinnedOrder.findIndex((convo) => convo.conversationId === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      // Update local state immediately for instant visual feedback
      const reorderedConversations = arrayMove(localPinnedOrder, oldIndex, newIndex);
      setLocalPinnedOrder(reorderedConversations);

      // Get the new order for the API
      const conversationIds = reorderedConversations
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Started dragging conversation ${active.id}`,
            onDragOver: ({ active, over }) =>
              over ? `Conversation ${active.id} is over ${over.id}` : '',
            onDragEnd: ({ active, over }) =>
              over
                ? `Conversation ${active.id} was moved to position of ${over.id}`
                : `Conversation ${active.id} was cancelled`,
            onDragCancel: ({ active }) => `Dragging conversation ${active.id} was cancelled`,
          },
        }}
      >
        <SortableContext
          items={localPinnedOrder
            .map((convo) => convo.conversationId)
            .filter((id): id is string => Boolean(id))}
          strategy={verticalListSortingStrategy}
        >
          {localPinnedOrder.map((conversation) => (
            <SortableConvo
              key={conversation.conversationId}
              conversation={conversation}
              toggleNav={toggleNav}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeConversation ? (
            <div className="rounded-md border border-border-light bg-surface-primary opacity-90 shadow-2xl">
              <Convo
                conversation={activeConversation}
                retainView={() => {}}
                toggleNav={() => {}}
                isLatestConvo={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
});

PinnedConversations.displayName = 'PinnedConversations';

export default PinnedConversations;
