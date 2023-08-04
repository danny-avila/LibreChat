import { atom } from 'recoil';
import { TPlugin } from 'librechat-data-provider';

const user = atom({
  key: 'user',
  default: null,
});

const availableTools = atom<TPlugin[]>({
  key: 'availableTools',
  default: [],
});

export default {
  user,
  availableTools,
};
