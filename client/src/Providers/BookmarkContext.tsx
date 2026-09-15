import { createContext, useContext } from 'react';
import type { TConversationTagCatalog } from 'librechat-data-provider';

type TBookmarkContext = { bookmarks: TConversationTagCatalog[] };

export const BookmarkContext = createContext<TBookmarkContext>({
  bookmarks: [],
} as TBookmarkContext);
export const useBookmarkContext = () => useContext(BookmarkContext);
