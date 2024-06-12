import { TMessage } from 'librechat-data-provider';
import { atom, selector } from 'recoil';
import { buildTree } from '~/utils';

const isSearchEnabled = atom<boolean | null>({
  key: 'isSearchEnabled',
  default: null,
});

const searchQuery = atom<{ text: string; category: 'user' | 'all'}>({
  key: 'searchQuery',
  default: {
    text: '',
    category: 'user',
  },
});

const searchResultMessages = atom<TMessage[] | null>({
  key: 'searchResultMessages',
  default: null,
});

const searchResultMessagesTree = selector({
  key: 'searchResultMessagesTree',
  get: ({ get }) => {
    return buildTree({ messages: get(searchResultMessages), groupAll: true });
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
