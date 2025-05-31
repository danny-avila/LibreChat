import React, { useRef } from 'react';
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
  const ref = useRef<HTMLTableRowElement>(null);
  const mutation = useConversationTagMutation({ context: 'BookmarkTableRow', tag: row.tag });
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const handleDrop = (item: DragItem) => {
    mutation.mutate(
      { ...row, position: item.index },
      {
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
    <TableRow
      ref={ref}
      className="cursor-move hover:bg-surface-secondary"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <TableCell className="w-[70%] px-4 py-4">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap">{row.tag}</div>
      </TableCell>
      <TableCell className="w-[10%] px-12 py-4">{row.count}</TableCell>
      <TableCell className="w-[20%] px-4 py-4">
        <div className="flex gap-2">
          <EditBookmarkButton bookmark={row} tabIndex={0} />
          <DeleteBookmarkButton bookmark={row.tag} tabIndex={0} />
        </div>
      </TableCell>
    </TableRow>
  );
};

export default BookmarkTableRow;
