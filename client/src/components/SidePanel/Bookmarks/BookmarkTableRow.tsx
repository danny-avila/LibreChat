import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { FC } from 'react';
import type { Identifier, XYCoord } from 'dnd-core';
import type { TConversationTag } from 'librechat-data-provider';
import { DeleteBookmarkButton, EditBookmarkButton } from '~/components/Bookmarks';
import { useConversationTagMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export const ItemTypes = {
  CARD: 'card',
};

export interface BookmarkItemProps {
  position: number;
  moveRow: (dragIndex: number, hoverIndex: number) => void;
  row: TConversationTag;
}

interface DragItem {
  index: number;
  id: string;
  type: string;
}

const BookmarkTableRow: FC<BookmarkItemProps> = ({ position, moveRow, row, ...rest }) => {
  const ref = useRef<HTMLTableRowElement>(null);

  const mutation = useConversationTagMutation(row.tag);
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
          message: localize('com_endpoint_preset_save_error'),
          severity: NotificationSeverity.ERROR,
        });
      },
    });
  };

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: ItemTypes.CARD,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    drop(item: DragItem, monitor) {
      handleDrop(item);
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = position;
      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      const clientOffset = monitor.getClientOffset();

      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveRow(dragIndex, hoverIndex);

      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: () => {
      return { id: row.tag, index: position };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  if (position > 0) {
    drag(drop(ref));
  }

  return (
    <tr
      className={cn(
        'group cursor-pointer gap-2 rounded text-sm hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-white/5',
        isDragging ? 'opacity-0' : 'opacity-100',
      )}
      key={row.tag}
      ref={ref}
      data-handler-id={handlerId}
      role="menuitem"
      tabIndex={-1}
      {...rest}
    >
      <td className="w-96 py-2 pl-6 pr-3">{row.tag}</td>
      <td className={cn('w-28 py-2 pl-4 pr-3 sm:pl-6')}>
        <span className="py-1">{row.count}</span>
      </td>
      <td className="flex-grow py-2 pl-4 pr-4 sm:pl-6">
        {position > 0 && (
          <div className="flex w-full items-center justify-end gap-2 py-1 text-gray-400">
            <EditBookmarkButton bookmark={row} />
            <DeleteBookmarkButton bookmark={row.tag} />
          </div>
        )}
      </td>
    </tr>
  );
};

export default BookmarkTableRow;
