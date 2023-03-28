import { atom, selector } from 'recoil';

const isSearchEnabled = atom({
  key: 'isSearchEnabled',
  default: null
});

const searchQuery = atom({
  key: 'searchQuery',
  default: ''
});

const isSearching = selector({
  key: 'isSearching',
  get: ({ get }) => {
    const data = get(searchQuery);
    return !!data;
  }
});

export default {
  isSearchEnabled,
  isSearching,
  searchQuery
};
