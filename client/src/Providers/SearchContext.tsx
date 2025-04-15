import { createContext, useContext } from 'react';
import { UseSearchMessagesResult } from '~/hooks/Conversations/useSearch';

export const SearchContext = createContext<UseSearchMessagesResult>({} as UseSearchMessagesResult);
export const useSearchContext = () => useContext(SearchContext);
