import React, { useState, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { TConversationTag } from 'librechat-data-provider';
import { DeleteBookmarkButton, EditBookmarkButton } from '~/components/Bookmarks';
import { useConversationTagMutation } from '~/data-provider';
import { TableRow, TableCell } from '~/components/ui';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface BookmarkTableRowProps {
  row: TConversationTag;
  moveRow: (dragIndex: number, hoverIndex: number) => void;
  position: number;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const BookmarkTableRow: React.FC<BookmarkTableRowProps> = ({ row, moveRow, position }) => {
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLTableRowElement>(null);

  const mutation = useConversationTagMutation({ context: 'BookmarkTableRow', tag: row.tag });
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const handleDrop = (item: DragItem) => {
    const data = {
      ...row,
      position: item.index,
    };
    mutation.mutate(data, {
      onError: () => {
        showToast({
          message: localize('com_ui_bookmarks_update_error'),
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  const [, drop] = useDrop({
    accept: 'bookmark',
    drop: (item: DragItem) => handleDrop(item),
    hover(item: DragItem) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = position;
      if (dragIndex === hoverIndex) {
        return;
      }
      moveRow(dragIndex, hoverIndex);
      item.index = hoverIndex;
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
    <TableRow
      ref={ref}
      className="cursor-move hover:bg-surface-secondary"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <TableCell className="w-full px-3 py-3.5 pl-6">
        <div className="truncate">{row.tag}</div>
      </TableCell>
      <TableCell className="w-full px-3 py-3.5 sm:pl-6">
        <div className="text-center">{row.count}</div>
      </TableCell>
      <TableCell className="w-full px-3 py-3.5 sm:pl-6">
        <div
          className="flex items-center justify-center gap-2"
          style={{
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.1s ease-in-out',
          }}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
        >
          <EditBookmarkButton
            bookmark={row}
            tabIndex={0}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
          />
          <DeleteBookmarkButton
            bookmark={row.tag}
            tabIndex={0}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
};

export default BookmarkTableRow;
