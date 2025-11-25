import { atom } from 'recoil';
import { constRecoilStateOpts } from '~/nj/utils/constRecoilState';

export type SearchState = {
  enabled: boolean | null;
  query: string;
  debouncedQuery: string;
  isSearching: boolean;
  isTyping: boolean;
};

// NJ: Since we're forcing all chats to be temporary, the search bar's presence makes no sense, so disable it
export const search = constRecoilStateOpts<SearchState>({
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
