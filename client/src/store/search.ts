import { atom } from 'recoil';

const isSearchEnabled = atom<boolean | null>({
  key: 'isSearchEnabled',
  default: null,
});

const searchQuery = atom({
  key: 'searchQuery',
  default: '',
});

export default {
  isSearchEnabled,
  searchQuery,
};
