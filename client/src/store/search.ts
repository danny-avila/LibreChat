import { atom } from 'recoil';

export type SearchState = {
  enabled: boolean | null;
  query: string;
  debouncedQuery: string;
  isSearching: boolean;
  isTyping: boolean;
};

export const search = atom<SearchState>({
  key: 'search',
  default: {
    enabled: null,
    query: '',
    debouncedQuery: '',
    isSearching: false,
    isTyping: false,
  },
});

export default {
  search,
};
