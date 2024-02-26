import { atom } from 'recoil';
import type { TUser, TPlugin } from 'librechat-data-provider';

const user = atom<TUser | undefined>({
  key: 'user',
  default: undefined,
});

const availableTools = atom<TPlugin[]>({
  key: 'availableTools',
  default: [],
});

export default {
  user,
  availableTools,
};
