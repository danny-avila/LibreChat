import { atom } from 'recoil';

export type SearchState = {
  enabled: boolean | null;
  query: string;
  debouncedQuery: string;
  isSearching: boolean;
  isTyping: boolean;
};

const searchState = atom<SearchState>({
  key: 'searchState',
  default: {
    enabled: null,
    query: '',
    debouncedQuery: '',
    isSearching: false,
    isTyping: false,
  },
});

export default {
  searchState,
};
