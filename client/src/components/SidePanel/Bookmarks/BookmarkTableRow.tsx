import React, { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { TConversationTag } from 'librechat-data-provider';
import { DeleteBookmarkButton, EditBookmarkButton } from '~/components/Bookmarks';
import { TableRow, TableCell } from '~/components/ui';

interface BookmarkTableRowProps {
  row: TConversationTag;
  moveRow: (dragIndex: number, hoverIndex: number) => void;
  position: number;
}

const BookmarkTableRow: React.FC<BookmarkTableRowProps> = ({ row, moveRow, position }) => {
  const [isHovered, setIsHovered] = useState(false);
  const ref = React.useRef<HTMLTableRowElement>(null);

  const [, drop] = useDrop({
    accept: 'bookmark',
    hover(item: { index: number }) {
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
      className="cursor-move hover:bg-gray-100 dark:hover:bg-gray-800"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <TableCell className="w-full px-3 py-3.5 pl-6">
        <div className="truncate">{row.tag}</div>
      </TableCell>
      <TableCell className="w-full px-3 py-3.5 sm:pl-6">
        <div className="flex items-center justify-between py-1">
          <div>{row.count}</div>
          <div
            className="flex items-center gap-2"
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
        </div>
      </TableCell>
    </TableRow>
  );
};

export default BookmarkTableRow;
