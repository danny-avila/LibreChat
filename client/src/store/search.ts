import { atom } from 'recoil';

const isEncryptionEnabled = atom<boolean>({
  key: 'isEncryptionEnabled',
  default: false,
});

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
  isEncryptionEnabled,
  isSearchEnabled,
  searchQuery,
  isSearching,
};
