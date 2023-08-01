import { atom, selector } from 'recoil';
import buildTree from '~/utils/buildTree';

const isSearchEnabled = atom({
  key: 'isSearchEnabled',
  default: null,
});

const searchQuery = atom({
  key: 'searchQuery',
  default: '',
});

const searchResultMessages = atom({
  key: 'searchResultMessages',
  default: null,
});

const searchResultMessagesTree = selector({
  key: 'searchResultMessagesTree',
  get: ({ get }) => {
    return buildTree(get(searchResultMessages), true);
  },
});

const isSearching = selector({
  key: 'isSearching',
  get: ({ get }) => {
    const data = get(searchQuery);
    return !!data;
  },
});

export default {
  isSearchEnabled,
  isSearching,
  searchResultMessages,
  searchResultMessagesTree,
  searchQuery,
};
