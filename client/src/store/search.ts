import { atom } from 'recoil';

const isSearchEnabled = atom<boolean | null>({
  key: 'isSearchEnabled',
  default: null,
});

const searchQuery = atom({
  key: 'searchQuery',
  default: '',
});

const isSearching = atom({
  key: 'isSearching',
  default: false,
});

export default {
  isSearchEnabled,
  searchQuery,
  isSearching,
};
