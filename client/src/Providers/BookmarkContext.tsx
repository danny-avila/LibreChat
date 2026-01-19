import { createContext, useContext } from 'react';
import type { TConversationTag } from 'vestai-data-provider';

type TBookmarkContext = { bookmarks: TConversationTag[] };

export const BookmarkContext = createContext<TBookmarkContext>({
  bookmarks: [],
} as TBookmarkContext);
export const useBookmarkContext = () => useContext(BookmarkContext);
