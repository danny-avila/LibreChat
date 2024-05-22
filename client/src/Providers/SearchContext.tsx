import { createContext, useContext } from 'react';
import useSearch from '~/hooks/Conversations/useSearch';
type SearchContextType = ReturnType<typeof useSearch>;

export const SearchContext = createContext<SearchContextType>({} as SearchContextType);
export const useSearchContext = () => useContext(SearchContext);
