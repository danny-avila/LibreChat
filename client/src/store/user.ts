import { atom } from 'jotai';
import type { TUser, TPlugin } from 'librechat-data-provider';

const user = atom<TUser | undefined>(undefined);

const availableTools = atom<Record<string, TPlugin>>({});

export default {
  user,
  availableTools,
};
