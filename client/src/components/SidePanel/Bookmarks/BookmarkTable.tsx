import React, { useCallback, useEffect, useState } from 'react';
import type { ConversationTagsResponse, TConversationTag } from 'librechat-data-provider';
import { BookmarkContext, useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTableRow from './BookmarkTableRow';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const BookmarkTable = () => {
  const localize = useLocalize();
  const [rows, setRows] = useState<ConversationTagsResponse>([]);

  const { bookmarks } = useBookmarkContext();
  useEffect(() => {
    setRows(bookmarks?.map((item) => ({ id: item.tag, ...item })) || []);
  }, [bookmarks]);

  const moveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    setRows((prevTags: TConversationTag[]) => {
      const updatedRows = [...prevTags];
      const [movedRow] = updatedRows.splice(dragIndex, 1);
      updatedRows.splice(hoverIndex, 0, movedRow);
      return updatedRows;
    });
  }, []);

  const renderRow = useCallback((row: TConversationTag, position: number) => {
    return <BookmarkTableRow key={row.tag} moveRow={moveRow} row={row} position={position} />;
  }, []);

  return (
    <BookmarkContext.Provider value={{ bookmarks }}>
      <div
        className={cn(
          'container',
          'relative h-[300px] overflow-auto',
          '-mx-4 w-auto ring-1 ring-gray-300 sm:mx-0 sm:rounded-lg',
        )}
      >
        <table className="min-w-full divide-gray-300">
          <thead className="sticky top-0 z-10 border-b bg-white">
            <tr className="text-left text-sm font-semibold text-gray-900">
              <th className="w-96 px-3 py-3.5 pl-6">
                <div>{localize('com_ui_bookmarks_title')}</div>
              </th>
              <th className="w-28 px-3 py-3.5 sm:pl-6">
                <div>{localize('com_ui_bookmarks_count')}</div>
              </th>

              <th className="flex-grow px-3 py-3.5 sm:pl-6"> </th>
            </tr>
          </thead>
          <tbody className="text-sm">{rows.map((row, i) => renderRow(row, i))}</tbody>
        </table>
      </div>
    </BookmarkContext.Provider>
  );
};

export default BookmarkTable;
