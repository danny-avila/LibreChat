import { atom } from 'jotai';

export type SearchState = {
  enabled: boolean | null;
  query: string;
  debouncedQuery: string;
  isSearching: boolean;
  isTyping: boolean;
};

export const search = atom<SearchState>({
  enabled: null,
  query: '',
  debouncedQuery: '',
  isSearching: false,
  isTyping: false,
});

export default {
  search,
};
