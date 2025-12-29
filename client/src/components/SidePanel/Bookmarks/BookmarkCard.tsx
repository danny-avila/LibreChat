import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { GripVertical } from 'lucide-react';
import type { TConversationTag } from 'librechat-data-provider';
import { TooltipAnchor, useToastContext } from '@librechat/client';
import { useConversationTagMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import BookmarkCardActions from './BookmarkCardActions';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface BookmarkCardProps {
  bookmark: TConversationTag;
  position: number;
  moveRow: (dragIndex: number, hoverIndex: number) => void;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

export default function BookmarkCard({ bookmark, position, moveRow }: BookmarkCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const mutation = useConversationTagMutation({
    context: 'BookmarkCard',
    tag: bookmark.tag,
  });

  const handleDrop = (item: DragItem) => {
    mutation.mutate(
      { ...bookmark, position: item.index },
      {
        onSuccess: () => {
          showToast({
            message: localize('com_ui_bookmarks_update_success'),
            severity: NotificationSeverity.SUCCESS,
          });
        },
        onError: () => {
          showToast({
            message: localize('com_ui_bookmarks_update_error'),
            severity: NotificationSeverity.ERROR,
          });
        },
      },
    );
  };

  const [, drop] = useDrop({
    accept: 'bookmark',
    drop: handleDrop,
    hover(item: DragItem) {
      if (!ref.current || item.index === position) {
        return;
      }
      moveRow(item.index, position);
      item.index = position;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: 'bookmark',
    item: { index: position },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={cn(
        'flex cursor-move items-center gap-2 rounded-lg px-3 py-2.5',
        'border border-border-light bg-transparent',
        'hover:bg-surface-secondary',
        isDragging && 'opacity-50',
      )}
    >
      {/* Drag handle */}
      <GripVertical className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />

      {/* Tag name */}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
        {bookmark.tag}
      </span>

      {/* Count badge */}
      <TooltipAnchor
        description={`${bookmark.count} ${localize(bookmark.count === 1 ? 'com_ui_conversation' : 'com_ui_conversations')}`}
        side="top"
        render={
          <span className="shrink-0 rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-secondary">
            {bookmark.count}
          </span>
        }
      />

      {/* Actions */}
      <div className="shrink-0">
        <BookmarkCardActions bookmark={bookmark} />
      </div>
    </div>
  );
}
